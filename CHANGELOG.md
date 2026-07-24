# Changelog

## [0.1.3](https://github.com/periwinkle-social/atproto/compare/atproto-pds-fork-v0.1.2...atproto-pds-fork-v0.1.3) (2026-07-24)


### Bug Fixes

* **oauth-client:** don't rely on AbortSignal.timeout (RN compat) ([5b51423](https://github.com/periwinkle-social/atproto/commit/5b51423be47ca8bc737551128f6f7dbaa4fa50db))


### Miscellaneous

* use org-level RELEASE_PLEASE_PAT for release-please workflow ([#15](https://github.com/periwinkle-social/atproto/issues/15)) ([4a6daed](https://github.com/periwinkle-social/atproto/commit/4a6daeda78900c633a3862524f6a3453bb327889))

## [0.1.2](https://github.com/periwinkle-social/atproto/compare/atproto-pds-fork-v0.1.1...atproto-pds-fork-v0.1.2) (2026-06-03)


### CI/CD

* **pds-dev:** skip redundant dev build on release-please release commit ([#12](https://github.com/periwinkle-social/atproto/issues/12)) ([8f139fd](https://github.com/periwinkle-social/atproto/commit/8f139fd0d5ab92fee6a978ade85d038fde607003))

## [0.1.1](https://github.com/periwinkle-social/atproto/compare/atproto-pds-fork-v0.1.0...atproto-pds-fork-v0.1.1) (2026-06-03)


### Features

* **cicd:** add bootstrap-cicd config for atproto IAM role ([ecb9280](https://github.com/periwinkle-social/atproto/commit/ecb9280cc10f091a0d06d8f588de5beae637c463))
* **doc:** add [@avivkeller](https://github.com/avivkeller) to disclosure credits ([#4482](https://github.com/periwinkle-social/atproto/issues/4482)) ([3cf5b31](https://github.com/periwinkle-social/atproto/commit/3cf5b31a2d8194dcfbfb8c3cc8e61282e48c9a82))
* **pds:** add goat-migrate-in sub-branch to entryway createAccount ([061537c](https://github.com/periwinkle-social/atproto/commit/061537c336603591c30173ce30b4dc0917ac2582))
* **pds:** add goat-migrate-in sub-branch to entryway createAccount ([5023450](https://github.com/periwinkle-social/atproto/commit/5023450cc930ffa4edcee85a671c2a7feae71736))
* **pds:** add PDS_ACTOR_STORE_KEY_DIRECTORY for separate key storage ([00df06a](https://github.com/periwinkle-social/atproto/commit/00df06a45790abc2ec8816feeefba1941701be63))
* **temporal:** replace repository dispatch with Temporal updateImages workflow ([5be9220](https://github.com/periwinkle-social/atproto/commit/5be9220d475c65b254dcdcf650b6c0d0d7579524))
* **temporal:** replace repository dispatch with Temporal updateImages workflow ([3a469ba](https://github.com/periwinkle-social/atproto/commit/3a469ba875fe93fc7c82920623e7ef0d06978f04))


### Bug Fixes

* **ci:** gate prod deploy behind workflow_dispatch to prevent feature branch pushes from deploying to prod ([f17e1dc](https://github.com/periwinkle-social/atproto/commit/f17e1dcfffb6f6e052d829a8d00b3c8d76bec36c))
* **ci:** use Temporal CLI instead of broken HTTP API and fix cluster name ([1a629c9](https://github.com/periwinkle-social/atproto/commit/1a629c95bb09a7328001c0b6828a7d3bed87f35d))
* Label creation notification race condition ([#4304](https://github.com/periwinkle-social/atproto/issues/4304)) ([1d219ff](https://github.com/periwinkle-social/atproto/commit/1d219ff3f6a5f2e3825ef04d3160af7855da773e))
* **pds:** add .js extension to entryway-mock import for nodenext ([c9cf87e](https://github.com/periwinkle-social/atproto/commit/c9cf87e37f5336c1a7d0e51526e448833b4f321c))
* **pds:** mount mock entryway lookup route before xrpc catchall ([3dbe6c1](https://github.com/periwinkle-social/atproto/commit/3dbe6c14e2124b29f7dc548cc8bcbec8aea9570f))
* **pds:** proxy requestPasswordReset to entryway in entryway mode ([#11](https://github.com/periwinkle-social/atproto/issues/11)) ([b351a83](https://github.com/periwinkle-social/atproto/commit/b351a83c82d95453bce9af84fddfbda395ce01ae))
* **pds:** stage pre-flight binding with hostname not host ([955e6cc](https://github.com/periwinkle-social/atproto/commit/955e6cc633eccb795060a28d5e2eb42d93691a1d))
* properly convert did:web to service endpoint ([#4502](https://github.com/periwinkle-social/atproto/issues/4502)) ([d40a66d](https://github.com/periwinkle-social/atproto/commit/d40a66dfe1f2367ff9ac6bbbafa2fa43ec5734b4))
* properly convert did:web to service endpoint ([#4502](https://github.com/periwinkle-social/atproto/issues/4502)) ([b329266](https://github.com/periwinkle-social/atproto/commit/b329266853b4867fbbcafc8845e479c888f8ac36))


### Documentation

* add CLAUDE.md for repo-level AI assistant context ([d603ab1](https://github.com/periwinkle-social/atproto/commit/d603ab17c173dcb9f549e6eaf190a80002d56253))
* add prettier and release-please instructions to CLAUDE.md ([4faf1b2](https://github.com/periwinkle-social/atproto/commit/4faf1b2427e5021ca8a1595752afa71f911a7b12))
* add prettier formatting instructions to CLAUDE.md ([677b4ac](https://github.com/periwinkle-social/atproto/commit/677b4acf0ab25bcd9a54c695fedea1fa96f928ed))
* note gh pr create fork default in CLAUDE.md ([9eb4c99](https://github.com/periwinkle-social/atproto/commit/9eb4c9927413f5cf11ff3743b4af29678fea44cc))
* Updating app password based session example ([#4631](https://github.com/periwinkle-social/atproto/issues/4631)) ([450f085](https://github.com/periwinkle-social/atproto/commit/450f0856630fa08c20dc60fef8b5d2a07b9a2552))


### Miscellaneous

* add bsync to pds, bsky, ozone service dockerfiles to fix build ([7f7bb09](https://github.com/periwinkle-social/atproto/commit/7f7bb09f130a42bfcc594eb76d4e67183b1894cd))
* **ci:** delete trigger-update-images.sh ([89c9499](https://github.com/periwinkle-social/atproto/commit/89c94996303ed25d2edcbd4b576a5776f4e043b6))
* remove repetitive word in comment ([#4276](https://github.com/periwinkle-social/atproto/issues/4276)) ([1e49025](https://github.com/periwinkle-social/atproto/commit/1e49025331c8743d1ef4057d71fbae32ffacf3c5))
* sync with upstream bluesky-social/atproto ([a2b08ea](https://github.com/periwinkle-social/atproto/commit/a2b08ea236d2999b4a48154587e315ca357f22af))
* sync with upstream bluesky-social/atproto ([67ae058](https://github.com/periwinkle-social/atproto/commit/67ae058a995105a65405d91c58590a0ee706783a))
* sync with upstream bluesky-social/atproto ([981799d](https://github.com/periwinkle-social/atproto/commit/981799dd9d5db627cd729ac72bf99e78ccda7053))
* sync with upstream bluesky-social/atproto (2026-06-03) ([593bc27](https://github.com/periwinkle-social/atproto/commit/593bc27394e74d3616674a2f7ca7e6ed85efcea3))


### Code Refactoring

* **ci:** pull secrets from 1Password instead of GitHub secrets/vars ([aeeac8d](https://github.com/periwinkle-social/atproto/commit/aeeac8d923955675d3cf011b7fffb4df706165b4))
* **ci:** query Supabase for PDS regions instead of hardcoded vars ([f93e4be](https://github.com/periwinkle-social/atproto/commit/f93e4be256f78920d336569389a122a00f64ca40))
* **ci:** simplify trigger script to pass imageTag to Temporal workflow ([a076c23](https://github.com/periwinkle-social/atproto/commit/a076c23630412482a1f35dcdf21d557c8760a587))
* **ci:** split PDS build workflow into separate dev and prod files ([2e8c41c](https://github.com/periwinkle-social/atproto/commit/2e8c41c337a17ecbc4521acf5f1748c990587f38))
* **ci:** trigger pds-control-plane via aws ecs run-task ([1e7a306](https://github.com/periwinkle-social/atproto/commit/1e7a306cb3e8b7eb4bab9521d5a7318ef1f25bdd))
* **ci:** use direct Postgres connection instead of Supabase REST API ([a666e1c](https://github.com/periwinkle-social/atproto/commit/a666e1c198542a130315772a8c0c1ef342470b38))


### CI/CD

* add paths-ignore for .github/** to skip test matrix on workflow-only changes ([dbe8728](https://github.com/periwinkle-social/atproto/commit/dbe8728c320af3562aa98406135dd2a6cd77f555))
* align atproto fork with standard CI/CD pattern ([666b2ee](https://github.com/periwinkle-social/atproto/commit/666b2ee66ccb3a4cd38426b85e862326e26cc236))
* align with standard CI/CD pattern (release-please, main triggers) ([bf16a02](https://github.com/periwinkle-social/atproto/commit/bf16a02f4cf4c4b1738af0dce7911e298d105ae0))
* comment out PDS auto-rollout instead of deleting ([d6effbd](https://github.com/periwinkle-social/atproto/commit/d6effbdf9444a74802671d6cdd91f73b0233a179))
* remove auto-rollout from PDS image workflows ([4e4404d](https://github.com/periwinkle-social/atproto/commit/4e4404d88c7d0162944808b25eb860ac19a2d682))
* remove auto-rollout from PDS image workflows ([1e687a7](https://github.com/periwinkle-social/atproto/commit/1e687a77f5c435dfa5411f353ac66f4bcd459896))
* remove upstream changeset workflow (we use release-please) ([d8c2e3f](https://github.com/periwinkle-social/atproto/commit/d8c2e3f2c2420ea65f19a626d25e5e6399c967ed))
