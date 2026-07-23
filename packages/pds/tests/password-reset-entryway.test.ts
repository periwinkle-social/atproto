import { jest } from '@jest/globals'
import getPort from 'get-port'
import type { AtpAgent } from '@atproto/api'
import { cidForCbor } from '@atproto/common'
import { Secp256k1Keypair } from '@atproto/crypto'
import { TestPds, TestPlc, mockResolvers } from '@atproto/dev-env'
import type { DidString, HandleString } from '@atproto/syntax'
import { MockEntryway } from './entryway-mock.js'

/**
 * Periwinkle deviation regression test.
 *
 * In entryway mode the entryway owns email and password-reset tokens, so the
 * PDS must proxy BOTH requestPasswordReset and resetPassword to the entryway.
 * Upstream's requestPasswordReset is local-first and only proxies when the PDS
 * has no local email. Periwinkle PDS accounts still carry a local email, so
 * upstream's behavior would mint the reset token in the PDS's own SQLite while
 * resetPassword (always proxied) checks the entryway's store — the token never
 * matches and reset fails with InvalidToken.
 *
 * This test seeds a PDS-local account WITH an email (the condition that
 * triggers the upstream local path) and asserts requestPasswordReset is still
 * proxied to the entryway and NOT handled locally.
 */
describe('requestPasswordReset in entryway mode', () => {
  let plc: TestPlc
  let pds: TestPds
  let entryway: MockEntryway
  let pdsAgent: AtpAgent

  const did = 'did:plc:localemailaccount0000' as DidString
  const handle = 'localemail.test' as HandleString
  const email = 'localemail@example.com'

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

    // Seed a PDS-local account that has an email + password. This is the
    // condition that, on upstream's local-first handler, would route the
    // reset locally instead of to the entryway.
    await pds.ctx.accountManager.createAccount({
      did,
      handle,
      email,
      password: 'local-account-password',
      repoCid: await cidForCbor({ seed: 'password-reset-entryway-test' }),
      repoRev: '3mjzqyyprdk2v',
    })
  })

  afterAll(async () => {
    await plc.close()
    await entryway.destroy()
    await pds.close()
  })

  it('proxies to the entryway even when the PDS has a local email', async () => {
    const sendResetPassword = jest.spyOn(pds.ctx.mailer, 'sendResetPassword')

    await pdsAgent.com.atproto.server.requestPasswordReset({ email })

    // The entryway received the proxied request...
    expect(entryway.passwordResetRequests).toContain(email)
    // ...and the PDS did NOT handle it locally (no local reset email sent).
    expect(sendResetPassword).not.toHaveBeenCalled()

    sendResetPassword.mockRestore()
  })
})
