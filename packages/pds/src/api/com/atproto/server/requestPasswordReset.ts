import { DAY, HOUR } from '@atproto/common'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  const { entrywayClient } = ctx

  server.add(com.atproto.server.requestPasswordReset, {
    rateLimit: [
      {
        durationMs: DAY,
        points: 50,
      },
      {
        durationMs: HOUR,
        points: 15,
      },
    ],
    handler: async ({ input: { body }, req }) => {
      // PERIWINKLE DEVIATION FROM UPSTREAM (intentional — keep across syncs):
      // In entryway mode the entryway owns email + password-reset tokens, so
      // proxy unconditionally. Upstream is local-first and only proxies when
      // the PDS has no local email — but Periwinkle PDS accounts still carry a
      // local email, which would mint the reset token in the PDS's SQLite
      // while resetPassword (always proxied) checks the entryway's store, so
      // the token never matches. Routing both halves to the entryway keeps
      // them consistent. Mirrors resetPassword.ts, which is likewise
      // entryway-only when entrywayClient is configured.
      if (entrywayClient) {
        const { headers } = ctx.entrywayPassthruHeaders(req)
        await entrywayClient.xrpc(com.atproto.server.requestPasswordReset, {
          headers,
          body,
        })
        return
      }

      const email = body.email.toLowerCase()

      const account = await ctx.accountManager.getAccountByEmail(email, {
        includeDeactivated: true,
        includeTakenDown: true,
      })

      if (account?.email) {
        const token = await ctx.accountManager.createEmailToken(
          account.did,
          'reset_password',
        )
        await ctx.mailer.sendResetPassword(
          { handle: account.handle ?? account.email, token },
          { to: account.email },
        )
        return
      }

      throw new InvalidRequestError('account does not have an email address')
    },
  })
}
