import * as plc from '@did-plc/lib'
import { isEmailValid } from '@hapi/address'
import { isDisposableEmail } from 'disposable-email-domains-js'
import { DidDocument, MINUTE, check } from '@atproto/common'
import { ExportableKeypair, Keypair, Secp256k1Keypair } from '@atproto/crypto'
import { AtprotoData, ensureAtpDocument } from '@atproto/identity'
import { DidString } from '@atproto/syntax'
import {
  AuthRequiredError,
  InvalidRequestError,
  Server,
} from '@atproto/xrpc-server'
import { AccountStatus } from '../../../../account-manager/account-manager.js'
import { NEW_PASSWORD_MAX_LENGTH } from '../../../../account-manager/helpers/scrypt.js'
import { AppContext } from '../../../../context.js'
import { baseNormalizeAndValidate } from '../../../../handle/index.js'
import { com } from '../../../../lexicons/index.js'
import { syncEvtDataFromCommit } from '../../../../sequencer/index.js'
import { safeResolveDidDoc } from './util.js'

/**
 * Periwinkle fork patch — goat-driven migrate-in sub-branch.
 *
 * Upstream's entryway-mode createAccount path requires the caller to bring a
 * fully-built PLC genesis op plus a reserved signing key. Goat's
 * `account migrate` does neither: it sends `{did, handle, password}` plus a
 * service-auth bearer (iss=sourceDid, aud=destPdsDid, lxm=createAccount) and
 * expects the destination to mint a fresh signing key inline and skip PLC
 * submission (the user submits PLC themselves via signPlcOperation later).
 *
 * Periwinkle's split entryway/PDS topology is the third atproto deployment
 * shape; goat is built for the two upstream shapes and not this one. We
 * accept this fork patch in our atproto/ fork to add a goat-shape sub-branch
 * to validateInputsForEntrywayPds. Existing entryway-PDS behavior is
 * preserved unchanged.
 *
 * On the goat sub-branch the patched PDS calls auth at
 * `social.pwkl.migration.lookup` (admin-Basic) to verify the pre-flight
 * binding and receive {accessJwt, refreshJwt}. Those tokens ride alongside
 * the validation result as `preMintedCreds` and the outer handler uses them
 * directly in the response, short-circuiting `createAccountAndSession` so we
 * don't end up with an orphaned PDS-local refresh row that goat can never
 * use (refreshSession is proxied to auth in entryway mode).
 *
 * Spec: specs/auth-entryway/migration-task-reliability/SPEC.md §3.
 */

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.server.createAccount, {
    rateLimit: {
      durationMs: 5 * MINUTE,
      points: 100,
    },
    auth: ctx.authVerifier.userServiceAuthOptional,
    handler: async ({
      input,
      auth,
      req,
    }): Promise<com.atproto.server.createAccount.$Output> => {
      // @NOTE Until this code and the OAuthStore's `createAccount` are
      // refactored together, any change made here must be reflected over there.

      const requester = auth.credentials?.did ?? null
      const validated = ctx.entrywayClient
        ? await validateInputsForEntrywayPds(ctx, input.body, requester)
        : await validateInputsForLocalPds(ctx, input.body, requester)
      const {
        did,
        handle,
        email,
        password,
        inviteCode,
        signingKey,
        plcOp,
        deactivated,
      } = validated
      // Set on the goat-migrate-in sub-branch only; auth has already minted
      // the session pair and we surface those instead of the PDS-local pair
      // that createAccountAndSession would mint.
      const preMintedCreds =
        'preMintedCreds' in validated ? validated.preMintedCreds : undefined

      let didDoc: DidDocument | undefined
      let creds: { accessJwt: string; refreshJwt: string }
      await ctx.actorStore.create(did, signingKey)
      try {
        const commit = await ctx.actorStore.transact(did, (actorTxn) =>
          actorTxn.repo.createRepo([]),
        )

        // Generate a real did with PLC
        if (plcOp) {
          try {
            await ctx.plcClient.sendOperation(did, plcOp)
          } catch (err) {
            req.log.error(
              { didKey: ctx.plcRotationKey.did(), handle },
              'failed to create did:plc',
            )
            throw err
          }
        }

        didDoc = await safeResolveDidDoc(ctx, did, true)

        if (preMintedCreds) {
          // Goat path: auth already minted the session. Create the
          // PDS-local account row only (no PDS-side refresh row); the
          // surfaced tokens are auth's, verified by the entryway-mode
          // PDS against the same oauth signing key it pins for
          // createSession.
          await ctx.accountManager.createAccount({
            did,
            handle,
            email,
            password,
            repoCid: commit.cid,
            repoRev: commit.rev,
            inviteCode,
            deactivated,
          })
          creds = preMintedCreds
        } else {
          creds = await ctx.accountManager.createAccountAndSession({
            did,
            handle,
            email,
            password,
            repoCid: commit.cid,
            repoRev: commit.rev,
            inviteCode,
            deactivated,
          })
        }

        if (!deactivated) {
          await ctx.sequencer.sequenceIdentityEvt(did, handle)
          await ctx.sequencer.sequenceAccountEvt(did, AccountStatus.Active)
          await ctx.sequencer.sequenceCommit(did, commit)
          await ctx.sequencer.sequenceSyncEvt(
            did,
            syncEvtDataFromCommit(commit),
          )
        }
        await ctx.accountManager.updateRepoRoot(did, commit.cid, commit.rev)
        await ctx.actorStore.clearReservedKeypair(signingKey.did(), did)
      } catch (err) {
        // this will only be reached if the actor store _did not_ exist before
        await ctx.actorStore.destroy(did)
        throw err
      }

      return {
        encoding: 'application/json' as const,
        body: {
          handle,
          did: did,
          // @ts-expect-error https://github.com/bluesky-social/atproto/pull/4406
          didDoc,
          accessJwt: creds.accessJwt,
          refreshJwt: creds.refreshJwt,
        },
      }
    },
  })
}

const validateInputsForEntrywayPds = async (
  ctx: AppContext,
  input: com.atproto.server.createAccount.$InputBody,
  requester: string | null,
) => {
  // Goat-driven migrate-in shape: source DID supplied, no plcOp, service-auth
  // bearer whose iss matches the source DID. This is Periwinkle-specific
  // (third deployment topology); upstream's two shapes wouldn't reach this
  // sub-branch because the entryway sends a plcOp.
  if (input.did && !input.plcOp) {
    return validateInputsForGoatMigrateIn(ctx, input, requester)
  }

  const { did, plcOp } = input
  const handle = baseNormalizeAndValidate(input.handle)
  if (!did || !input.plcOp) {
    throw new InvalidRequestError(
      'non-entryway pds requires bringing a DID and plcOp',
    )
  }
  if (!check.is(plcOp, plc.def.operation)) {
    throw new InvalidRequestError('invalid plc operation', 'IncompatibleDidDoc')
  }
  const plcRotationKey = ctx.cfg.entryway?.plcRotationKey
  if (!plcRotationKey || !plcOp.rotationKeys.includes(plcRotationKey)) {
    throw new InvalidRequestError(
      'PLC DID does not include service rotation key',
      'IncompatibleDidDoc',
    )
  }
  try {
    await plc.assureValidOp(plcOp)
    await plc.assureValidSig([plcRotationKey], plcOp)
  } catch (err) {
    throw new InvalidRequestError('invalid plc operation', 'IncompatibleDidDoc')
  }
  const doc = plc.formatDidDoc({ did, ...plcOp })
  const data = ensureAtpDocument(doc)

  let signingKey: ExportableKeypair | undefined
  if (input.did) {
    signingKey = await ctx.actorStore.getReservedKeypair(input.did)
  }
  if (!signingKey) {
    signingKey = await ctx.actorStore.getReservedKeypair(data.signingKey)
  }
  if (!signingKey) {
    throw new InvalidRequestError('reserved signing key does not exist')
  }

  validateAtprotoData(data, {
    handle,
    pds: ctx.cfg.service.publicUrl,
    signingKey: signingKey.did(),
  })

  return {
    did,
    handle,
    email: undefined,
    password: undefined,
    inviteCode: undefined,
    signingKey,
    plcOp,
    deactivated: false,
  }
}

/**
 * Goat-driven migrate-in sub-branch. Authenticates against auth's
 * pre-flight row and returns a fresh signing key + auth-minted session
 * tokens. The actor store is filed deactivated; goat's follow-on
 * `signPlcOperation` flow flips identity and goat's `activateAccount`
 * call brings the actor store live.
 */
const validateInputsForGoatMigrateIn = async (
  ctx: AppContext,
  input: com.atproto.server.createAccount.$InputBody,
  requester: string | null,
) => {
  const { did, password } = input
  if (!did) {
    // Defensive: callers should hit this path only when input.did is set,
    // but keep the guard for clarity at the function boundary.
    throw new InvalidRequestError('did is required for migrate-in')
  }
  if (requester !== did) {
    // The xrpc-server framework already enforces aud (= ctx serviceDid)
    // and lxm (= com.atproto.server.createAccount) on the service-auth
    // bearer. iss-vs-input.did is the additional goat-specific check:
    // only the source-account holder's signing key may stand in this
    // chain, otherwise the migration is not authorized.
    throw new AuthRequiredError(
      `Missing auth to create account with did: ${did}`,
    )
  }
  const handle = baseNormalizeAndValidate(input.handle)
  if (!password) {
    throw new InvalidRequestError(
      'password is required for goat-driven migrate-in',
    )
  }
  if (password.length > NEW_PASSWORD_MAX_LENGTH) {
    throw new InvalidRequestError(
      `Password too long. Maximum length is ${NEW_PASSWORD_MAX_LENGTH} characters.`,
    )
  }

  if (!ctx.entrywayAdminClient) {
    throw new InvalidRequestError(
      'goat-driven migrate-in requires entryway admin client',
    )
  }

  // Ask auth to verify the pre-flight binding and mint the session JWTs.
  // Use the entrywayAdminClient's fetchHandler so the configured
  // Authorization: Basic admin:<token> rides along; the lexicon for
  // social.pwkl.migration.lookup is Periwinkle-specific and isn't loaded
  // into the agent's lex registry, so the typed xrpc() helper isn't an
  // option here.
  const lookupRes = await ctx.entrywayAdminClient.fetchHandler(
    '/xrpc/social.pwkl.migration.lookup',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        did,
        pdsHostname: new URL(ctx.cfg.service.publicUrl).hostname,
        handle,
        password,
      }),
    },
  )
  if (!lookupRes.ok) {
    let message = `migrate-in lookup failed (${lookupRes.status})`
    try {
      const body = (await lookupRes.json()) as { message?: string }
      if (typeof body.message === 'string') {
        message = `${message}: ${body.message}`
      }
    } catch {
      // Non-JSON body — keep the generic message.
    }
    throw new InvalidRequestError(message)
  }
  const lookupBody = (await lookupRes.json()) as {
    accessJwt?: unknown
    refreshJwt?: unknown
  }
  if (
    typeof lookupBody.accessJwt !== 'string' ||
    typeof lookupBody.refreshJwt !== 'string'
  ) {
    throw new InvalidRequestError(
      'migrate-in lookup returned a malformed token pair',
    )
  }

  const signingKey = await Secp256k1Keypair.create({ exportable: true })

  return {
    did,
    handle,
    // PDS-local account row gets no email/password — auth owns those for
    // entryway-mode accounts.
    email: undefined,
    password: undefined,
    inviteCode: undefined,
    signingKey,
    plcOp: null,
    deactivated: true,
    preMintedCreds: {
      accessJwt: lookupBody.accessJwt,
      refreshJwt: lookupBody.refreshJwt,
    },
  }
}

const validateInputsForLocalPds = async (
  ctx: AppContext,
  input: com.atproto.server.createAccount.$InputBody,
  requester: string | null,
) => {
  const { email, password, inviteCode } = input
  if (input.plcOp) {
    throw new InvalidRequestError('Unsupported input: "plcOp"')
  }

  if (password && password.length > NEW_PASSWORD_MAX_LENGTH) {
    throw new InvalidRequestError(
      `Password too long. Maximum length is ${NEW_PASSWORD_MAX_LENGTH} characters.`,
    )
  }

  if (ctx.cfg.invites.required && !inviteCode) {
    throw new InvalidRequestError(
      'No invite code provided',
      'InvalidInviteCode',
    )
  }

  if (!email) {
    throw new InvalidRequestError('Email is required')
  } else if (!isEmailValid(email) || isDisposableEmail(email)) {
    throw new InvalidRequestError(
      'This email address is not supported, please use a different email.',
    )
  }

  // normalize & ensure valid handle
  const handle = await ctx.accountManager.normalizeAndValidateHandle(
    input.handle,
    { did: input.did },
  )

  // check that the invite code still has uses
  if (ctx.cfg.invites.required && inviteCode) {
    await ctx.accountManager.ensureInviteIsAvailable(inviteCode)
  }

  // check that the handle and email are available
  const [handleAccnt, emailAcct] = await Promise.all([
    ctx.accountManager.getAccount(handle),
    ctx.accountManager.getAccountByEmail(email),
  ])
  if (handleAccnt) {
    throw new InvalidRequestError(`Handle already taken: ${handle}`)
  } else if (emailAcct) {
    throw new InvalidRequestError(`Email already taken: ${email}`)
  }

  // determine the did & any plc ops we need to send
  // if the provided did document is poorly setup, we throw
  const signingKey = await Secp256k1Keypair.create({ exportable: true })

  let did: DidString
  let plcOp: plc.Operation | null
  let deactivated = false
  if (input.did) {
    if (input.did !== requester) {
      throw new AuthRequiredError(
        `Missing auth to create account with did: ${input.did}`,
      )
    }
    did = input.did
    plcOp = null
    deactivated = true
  } else {
    const formatted = await formatDidAndPlcOp(ctx, handle, input, signingKey)
    did = formatted.did as DidString
    plcOp = formatted.plcOp
  }

  return {
    did,
    handle,
    email,
    password,
    inviteCode,
    signingKey,
    plcOp,
    deactivated,
  }
}

const formatDidAndPlcOp = async (
  ctx: AppContext,
  handle: string,
  input: com.atproto.server.createAccount.$InputBody,
  signingKey: Keypair,
): Promise<{
  did: string
  plcOp: plc.Operation | null
}> => {
  // if the user is not bringing a DID, then we format a create op for PLC
  const rotationKeys = [ctx.plcRotationKey.did()]
  if (ctx.cfg.identity.recoveryDidKey) {
    rotationKeys.unshift(ctx.cfg.identity.recoveryDidKey)
  }
  if (input.recoveryKey) {
    rotationKeys.unshift(input.recoveryKey)
  }
  const plcCreate = await plc.createOp({
    signingKey: signingKey.did(),
    rotationKeys,
    handle,
    pds: ctx.cfg.service.publicUrl,
    signer: ctx.plcRotationKey,
  })
  return {
    did: plcCreate.did,
    plcOp: plcCreate.op,
  }
}
const validateAtprotoData = (
  data: AtprotoData,
  expected: {
    handle: string
    pds: string
    signingKey: string
  },
) => {
  // if the user is bringing their own did:
  // resolve the user's did doc data, including rotationKeys if did:plc
  // determine if we have the capability to make changes to their DID
  if (data.handle !== expected.handle) {
    throw new InvalidRequestError(
      'provided handle does not match DID document handle',
      'IncompatibleDidDoc',
    )
  } else if (data.pds !== expected.pds) {
    throw new InvalidRequestError(
      'DID document pds endpoint does not match service endpoint',
      'IncompatibleDidDoc',
    )
  } else if (data.signingKey !== expected.signingKey) {
    throw new InvalidRequestError(
      'DID document signing key does not match service signing key',
      'IncompatibleDidDoc',
    )
  }
}
