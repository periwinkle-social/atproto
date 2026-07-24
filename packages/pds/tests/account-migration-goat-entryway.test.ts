import assert from 'node:assert'
import * as plcLib from '@did-plc/lib'
import getPort from 'get-port'
import type { AtpAgent } from '@atproto/api'
import { type Keypair, Secp256k1Keypair } from '@atproto/crypto'
import { TestPds, TestPlc, mockResolvers } from '@atproto/dev-env'
import { isDidString } from '@atproto/lex'
import type { DidString, HandleString } from '@atproto/syntax'
import { createServiceAuthHeaders } from '@atproto/xrpc-server'
import { com } from '../src/lexicons/index.js'
import { MockEntryway } from './entryway-mock.js'

/**
 * Periwinkle fork patch — goat-driven migrate-in sub-branch.
 *
 * Exercises the new sub-branch in
 * packages/pds/src/api/com/atproto/server/createAccount.ts that recognizes
 * the goat shape ({did, handle, password} + service-auth bearer) and
 * delegates token-minting to auth via social.pwkl.migration.lookup.
 *
 * Spec: specs/auth-entryway/migration-task-reliability/SPEC.md §3.
 */

describe('createAccount goat-migrate-in sub-branch', () => {
  let plc: TestPlc
  let pds: TestPds
  let entryway: MockEntryway
  let pdsAgent: AtpAgent

  let sourceKey: Secp256k1Keypair
  let sourceDid: DidString
  const handle: HandleString = 'alice.test' as HandleString
  const password = 'goat-password-secret'

  const opAndDid = async (h: string, key: Keypair) => {
    const op = await plcLib.signOperation(
      {
        type: 'plc_operation',
        alsoKnownAs: [h],
        verificationMethods: { atproto: key.did() },
        rotationKeys: [key.did()],
        services: {},
        prev: null,
      },
      key,
    )
    const did = (await plcLib.didForCreateOp(op)) as DidString
    return { op, did }
  }

  beforeAll(async () => {
    const jwtSigningKey = await Secp256k1Keypair.create({ exportable: true })
    const plcRotationKey = await Secp256k1Keypair.create({ exportable: true })
    const entrywayPort = await getPort()
    plc = await TestPlc.create({})
    pds = await TestPds.create({
      entrywayUrl: `http://localhost:${entrywayPort}`,
      entrywayDid: 'did:example:entryway',
      entrywayJwtVerifyKeyK256PublicKeyHex: jwtSigningKey.publicKeyStr('hex'),
      entrywayPlcRotationKey: plcRotationKey.did(),
      adminPassword: 'admin-pass',
      serviceHandleDomains: [],
      didPlcUrl: plc.url,
      serviceDid: 'did:example:pds',
      inviteRequired: false,
    })
    entryway = await MockEntryway.create({
      port: entrywayPort,
      serviceDid: 'did:example:entryway',
      plcUrl: plc.url,
      pdsUrl: pds.url,
      pdsDid: 'did:example:pds',
      adminPassword: 'admin-pass',
      jwtSigningKey,
      plcRotationKey,
    })
    mockResolvers(pds.ctx.idResolver, pds)
    mockResolvers(entryway.idResolver, pds)
    pdsAgent = pds.getAgent()

    // Stand up a "source" identity in PLC: a fresh keypair + a PLC genesis
    // op whose verificationMethods.atproto points at it. This lets the PDS's
    // userServiceAuthOptional verifier resolve the service-auth bearer
    // signed below back to a valid signing key.
    sourceKey = await Secp256k1Keypair.create()
    const { op: sourceOp, did } = await opAndDid('alice.bsky.social', sourceKey)
    sourceDid = did
    await plc.getClient().sendOperation(sourceDid, sourceOp)

    // Stage the pre-flight binding in the mock entryway. In production, the
    // portal would have called social.pwkl.migration.preFlight at form
    // submit; here we shortcut by calling the mock's stagePreFlight().
    entryway.stagePreFlight({
      did: sourceDid,
      handle,
      password,
      pdsHostname: new URL(pds.url).hostname,
      email: 'alice@example.com',
    })
  })

  afterAll(async () => {
    await plc.close()
    await entryway.destroy()
    await pds.close()
  })

  it('happy path — goat-shape createAccount returns auth-minted JWTs', async () => {
    const headers = await createServiceAuthHeaders({
      iss: sourceDid,
      aud: pds.ctx.cfg.service.did,
      lxm: com.atproto.server.createAccount.$lxm,
      keypair: sourceKey,
    })
    const res = await pdsAgent.com.atproto.server.createAccount(
      {
        did: sourceDid,
        handle,
        password,
      },
      {
        ...headers,
        encoding: 'application/json',
      },
    )

    assert(isDidString(res.data.did))
    expect(res.data.did).toEqual(sourceDid)
    expect(res.data.handle).toEqual(handle)
    expect(typeof res.data.accessJwt).toBe('string')
    expect(typeof res.data.refreshJwt).toBe('string')
    // Three JWT segments — proves we surfaced something JWT-shaped.
    expect(res.data.accessJwt.split('.')).toHaveLength(3)
    expect(res.data.refreshJwt.split('.')).toHaveLength(3)

    // PDS-local actor + account row was created (deactivated, since this is
    // the migrate-in shape).
    const account = await pds.ctx.accountManager.getAccount(sourceDid, {
      includeDeactivated: true,
    })
    expect(account?.did).toEqual(sourceDid)
    expect(account?.handle).toEqual(handle)
    expect(account?.deactivatedAt).toBeTruthy()
  })

  it('mismatched bearer iss → AuthRequiredError', async () => {
    // Stand up a *different* DID and sign the bearer with its key; the PDS
    // should reject because requester (= bearer.iss) won't equal input.did.
    const otherKey = await Secp256k1Keypair.create()
    const { op: otherOp, did: otherDid } = await opAndDid(
      'bob.bsky.social',
      otherKey,
    )
    await plc.getClient().sendOperation(otherDid, otherOp)

    // Stage a row keyed to sourceDid (the original pre-flight); we'll send
    // input.did = sourceDid but sign with otherKey/otherDid so iss !== did.
    const headers = await createServiceAuthHeaders({
      iss: otherDid,
      aud: pds.ctx.cfg.service.did,
      lxm: com.atproto.server.createAccount.$lxm,
      keypair: otherKey,
    })
    await expect(
      pdsAgent.com.atproto.server.createAccount(
        {
          did: sourceDid,
          handle: 'someone-else.test' as HandleString,
          password,
        },
        { ...headers, encoding: 'application/json' },
      ),
    ).rejects.toThrow(/Missing auth/)
  })

  it('wrong password → InvalidRequest from auth lookup', async () => {
    // The bearer is correctly signed by sourceKey; we just send the wrong
    // password in the body. The auth-side lookup should reject, and the
    // patched PDS should surface that as InvalidRequest before any actor
    // store mutation.
    const headers = await createServiceAuthHeaders({
      iss: sourceDid,
      aud: pds.ctx.cfg.service.did,
      lxm: com.atproto.server.createAccount.$lxm,
      keypair: sourceKey,
    })
    await expect(
      pdsAgent.com.atproto.server.createAccount(
        {
          did: sourceDid,
          handle,
          password: 'wrong-password',
        },
        { ...headers, encoding: 'application/json' },
      ),
    ).rejects.toThrow(/lookup failed|does not match/i)
  })

  it('no pre-flight row staged → InvalidRequest from auth lookup', async () => {
    // A fresh DID with no staged pre-flight binding.
    const orphanKey = await Secp256k1Keypair.create()
    const { op: orphanOp, did: orphanDid } = await opAndDid(
      'carol.bsky.social',
      orphanKey,
    )
    await plc.getClient().sendOperation(orphanDid, orphanOp)

    const headers = await createServiceAuthHeaders({
      iss: orphanDid,
      aud: pds.ctx.cfg.service.did,
      lxm: com.atproto.server.createAccount.$lxm,
      keypair: orphanKey,
    })
    await expect(
      pdsAgent.com.atproto.server.createAccount(
        {
          did: orphanDid,
          handle: 'carol.test' as HandleString,
          password: 'whatever',
        },
        { ...headers, encoding: 'application/json' },
      ),
    ).rejects.toThrow(/lookup failed|does not match/i)
  })
})
