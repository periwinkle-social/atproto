# AT Protocol PDS (Personal Data Server) - Architecture Overview

A beginner-friendly guide to what the PDS is, how it's built, and what every
package does.

---

## What is a PDS?

A **Personal Data Server** is your home on the AT Protocol network. It stores
your identity, your posts, your follows, your blobs (images/videos) - everything
that makes up "your account." Think of it like your own little server that holds
your data and speaks the AT Protocol so other servers can find and sync with you.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Container                                │
│  Node.js 20 on Alpine Linux  ·  Port 3000  ·  dumb-init (PID 1)       │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     services/pds/index.js                         │  │
│  │  Reads env → builds config → creates PDS instance → starts it    │  │
│  └────────────────────────────┬──────────────────────────────────────┘  │
│                               │                                         │
│  ┌────────────────────────────▼──────────────────────────────────────┐  │
│  │                     @atproto/pds  (core)                          │  │
│  │                                                                    │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │  │
│  │  │  Express     │  │ XRPC Server  │  │  OAuth Provider         │  │  │
│  │  │  (HTTP)      │──│ (AT Proto    │  │  (@atproto/oauth-       │  │  │
│  │  │  + CORS      │  │  RPC layer)  │  │   provider)             │  │  │
│  │  │  + compress  │  │              │  │                         │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └─────────────────────────┘  │  │
│  │         │                 │                                        │  │
│  │  ┌──────▼─────────────────▼───────────────────────────────────┐   │  │
│  │  │                    API Layer                                │   │  │
│  │  │                                                            │   │  │
│  │  │  com.atproto.*              │  app.bsky.*                  │   │  │
│  │  │  ┌─────────────────────┐    │  ┌────────────────────────┐  │   │  │
│  │  │  │ identity (DID/      │    │  │ actor (profiles)       │  │   │  │
│  │  │  │   handle mgmt)      │    │  │ feed (timelines)       │  │   │  │
│  │  │  │ repo (CRUD records) │    │  │ notification           │  │   │  │
│  │  │  │ sync (repo sync)    │    │  └────────────────────────┘  │   │  │
│  │  │  │ server (accounts)   │    │                              │   │  │
│  │  │  │ admin / moderation  │    │                              │   │  │
│  │  │  └─────────────────────┘    │                              │   │  │
│  │  └────────────────────────────────────────────────────────────┘   │  │
│  │         │              │               │              │            │  │
│  │  ┌──────▼──────┐ ┌────▼─────┐  ┌──────▼──────┐ ┌────▼────────┐  │  │
│  │  │ Account     │ │ Actor    │  │ Sequencer   │ │ DID Cache   │  │  │
│  │  │ Manager     │ │ Store    │  │ (event      │ │ (resolve &  │  │  │
│  │  │ (users,     │ │ (repos,  │  │  outbox for │ │  cache DID  │  │  │
│  │  │  sessions,  │ │  blobs,  │  │  federation)│ │  documents) │  │  │
│  │  │  tokens)    │ │  prefs)  │  │             │ │             │  │  │
│  │  └──────┬──────┘ └────┬─────┘  └──────┬──────┘ └─────┬──────┘  │  │
│  │         │             │               │               │          │  │
│  │  ┌──────▼─────────────▼───────────────▼───────────────▼──────┐  │  │
│  │  │                   Storage Layer                            │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │  │  │
│  │  │  │ SQLite       │  │ Redis        │  │ Disk / S3      │  │  │  │
│  │  │  │ (better-     │  │ (ioredis)    │  │ Blob Store     │  │  │  │
│  │  │  │  sqlite3)    │  │ rate limits, │  │ (@atproto/aws) │  │  │  │
│  │  │  │ via Kysely   │  │ caching      │  │                │  │  │  │
│  │  │  │ query builder│  │              │  │                │  │  │  │
│  │  │  └──────────────┘  └──────────────┘  └────────────────┘  │  │  │
│  │  └───────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

External Network Connections
─────────────────────────────
  ↕ Other PDS instances (sync / federation)
  ↕ PLC Directory (DID resolution)
  ↕ AppView / Relay (indexing, firehose)
  ↕ SMTP server (email via nodemailer)
```

---

## Package-by-Package Breakdown

### Internal `@atproto/*` Packages (the building blocks)

These are all part of the same monorepo and are purpose-built for the AT Protocol.

| Package | What it does | Analogy |
|---|---|---|
| `@atproto/xrpc-server` | Implements the XRPC protocol on top of Express. XRPC is AT Proto's RPC framework - like REST but with a schema system (Lexicon). | The waiter who takes your order and brings back food |
| `@atproto/xrpc` | Base XRPC types and client utilities shared between client and server. | The menu format both kitchen and waiter agree on |
| `@atproto/api` | High-level client for talking to other AT Proto services (used for proxying requests to AppViews). | A phone the PDS uses to call other servers |
| `@atproto/repo` | Implements Merkle Search Tree (MST) repositories. Every user's data is a signed, content-addressed tree of records. | The filing cabinet that organizes all your documents |
| `@atproto/identity` | Resolves DIDs and handles. Maps `@alice.bsky.social` to `did:plc:abc123` and fetches DID documents. | The address book / phone directory |
| `@atproto/crypto` | Cryptographic signing and verification (secp256k1, P-256 curves). Used to sign repository commits. | The wax seal that proves a letter is authentic |
| `@atproto/lexicon` | The schema system for AT Proto. Defines what data shapes are valid for each record type. | The blueprint that says what a "post" looks like |
| `@atproto/lex-cbor` | Encodes/decodes data using CBOR (Concise Binary Object Representation) following Lexicon rules. | A translator between human-readable and compact binary |
| `@atproto/lex-data` | Validates and transforms data against Lexicon schemas. | The inspector checking that packages match their labels |
| `@atproto/syntax` | Parses and validates AT Proto syntax: handles, DIDs, AT-URIs, NSIDs. | The grammar checker for AT Proto addresses |
| `@atproto/common` | Shared utilities: TID generation, date formatting, stream helpers, retry logic. | The toolbox everyone borrows from |
| `@atproto/oauth-provider` | Full OAuth 2.0 authorization server. Handles login flows, token issuance, DPoP. | The bouncer who checks IDs at the door |
| `@atproto/oauth-scopes` | Defines and validates OAuth permission scopes (what an app is allowed to do). | The VIP list of who can access what |
| `@atproto/aws` | AWS S3 integration for blob storage. Images and media can be stored in S3 instead of local disk. | The warehouse for storing large files |

### Internal `@atproto-labs/*` Packages (utilities)

| Package | What it does |
|---|---|
| `@atproto-labs/fetch-node` | Node.js-optimized HTTP fetch wrapper with timeouts and retries. |
| `@atproto-labs/simple-store` | Interface for key-value stores (abstraction layer). |
| `@atproto-labs/simple-store-memory` | In-memory implementation of simple-store (for dev/small deployments). |
| `@atproto-labs/simple-store-redis` | Redis-backed implementation of simple-store (for production). |
| `@atproto-labs/xrpc-utils` | Shared XRPC helper functions. |

### External Dependencies (the off-the-shelf parts)

#### Web Framework & HTTP

| Package | What it does | Why the PDS needs it |
|---|---|---|
| `express` | Web framework for handling HTTP requests | Core HTTP server - all API endpoints run through Express |
| `express-async-errors` | Patches Express to catch async errors | Without this, unhandled promise rejections crash the server |
| `cors` | Cross-Origin Resource Sharing middleware | Lets browser-based apps (like bsky.app) call the PDS API |
| `compression` | gzip/deflate response compression | Reduces bandwidth for API responses |
| `http-terminator` | Graceful HTTP server shutdown | Lets in-flight requests finish before the server stops |
| `undici` | Modern HTTP client (faster than node-fetch) | Makes outbound HTTP calls to other servers |

#### Database & Storage

| Package | What it does | Why the PDS needs it |
|---|---|---|
| `better-sqlite3` | Fast, synchronous SQLite driver | Primary database - stores accounts, records, preferences |
| `kysely` | Type-safe SQL query builder | Write SQL queries with TypeScript type checking |
| `ioredis` | Redis client | Rate limiting, caching, session storage in production |

#### Cryptography & Auth

| Package | What it does | Why the PDS needs it |
|---|---|---|
| `jose` | JSON Web Tokens (JWT), JWS, JWE, JWK | Token signing/verification for auth sessions |
| `key-encoder` | Converts crypto keys between formats (PEM, DER, raw) | Interop between different key representations |
| `@did-plc/lib` | Client library for the PLC DID directory | Create and update DID documents in the PLC registry |

#### Data Formats & Validation

| Package | What it does | Why the PDS needs it |
|---|---|---|
| `zod` | Runtime schema validation | Validates configuration, API inputs, environment variables |
| `multiformats` | CID (Content Identifier) and multicodec support | Content-addressing for the Merkle tree repository |
| `uint8arrays` | Utilities for working with binary data | Encoding/decoding binary for crypto and CBOR |
| `file-type` | Detects file types from binary content | Validates uploaded blobs (images, etc.) are what they claim |

#### Email

| Package | What it does | Why the PDS needs it |
|---|---|---|
| `nodemailer` | Sends emails via SMTP | Account verification, password reset emails |
| `nodemailer-html-to-text` | Converts HTML emails to plain text | Ensures emails have a text fallback |
| `handlebars` | Template engine | Renders email templates with dynamic content |
| `disposable-email-domains-js` | List of throwaway email domains | Blocks signups from temporary email services |
| `@hapi/address` | Email and URI validation | Validates email addresses during signup |

#### Observability & Utilities

| Package | What it does | Why the PDS needs it |
|---|---|---|
| `pino` | Fast JSON logger | Structured logging for debugging and monitoring |
| `pino-http` | HTTP request logging for pino | Logs every API request with timing info |
| `bytes` | Parse/format byte strings ("1kb" → 1024) | Configuration of payload size limits |
| `glob` | File pattern matching | Finding migration files, templates on disk |
| `p-queue` | Promise concurrency queue | Limits parallel operations (e.g., background tasks) |
| `typed-emitter` | Type-safe Node.js EventEmitter | Internal event bus with TypeScript support |

---

## The Dockerfile - How it all gets packaged

```
Stage 1: BUILD                          Stage 2: RUNTIME
┌──────────────────────────┐           ┌──────────────────────────┐
│ Node.js 20 + Alpine      │           │ Node.js 20 + Alpine      │
│                          │           │                          │
│ 1. Copy all workspace    │           │ 1. Install dumb-init     │
│    package.json files    │           │    (proper PID 1)        │
│                          │           │                          │
│ 2. pnpm install          │    COPY   │ 2. Copy only production  │
│    (all dependencies)    │ ────────> │    node_modules + dist   │
│                          │           │                          │
│ 3. Build @atproto/pds    │           │ 3. Run as non-root user  │
│    + all its deps        │           │                          │
│                          │           │ 4. Expose port 3000      │
│ 4. Re-install with       │           │                          │
│    --prod (strip dev)    │           │ 5. CMD: node index.js    │
└──────────────────────────┘           └──────────────────────────┘
        ~1.5 GB                              ~200 MB (much smaller!)
```

**Key design decisions:**
- **Multi-stage build** - keeps the final image small by discarding build tools
- **dumb-init** - ensures signals (SIGTERM) reach Node.js properly in Docker
- **Non-root user** - security best practice
- **`UV_USE_IO_URING=0`** - disables io_uring to avoid known kernel issues
- **Source maps enabled** - better stack traces in production errors

---

## How a Request Flows Through the PDS

```
Client (app)
    │
    │  HTTPS request: com.atproto.repo.createRecord
    │
    ▼
┌─────────────┐
│   Express    │  1. Parse request, apply CORS, compress
└──────┬──────┘
       ▼
┌─────────────┐
│ Rate Limiter │  2. Check Redis: has this IP/user exceeded limits?
└──────┬──────┘
       ▼
┌─────────────┐
│    XRPC      │  3. Route to the right handler based on method name
│   Server     │     Validate input against Lexicon schema
└──────┬──────┘
       ▼
┌─────────────┐
│ Auth Check   │  4. Verify JWT/OAuth token, identify the user
└──────┬──────┘
       ▼
┌─────────────┐
│  API Handler │  5. Business logic: validate the record,
│              │     write to repo (MST), store in SQLite
└──────┬──────┘
       ▼
┌─────────────┐
│  Sequencer   │  6. Emit event so relays/other services
│              │     can pick up the change
└──────┬──────┘
       ▼
    Response back to client
```

---

## Glossary

| Term | Meaning |
|---|---|
| **DID** | Decentralized Identifier - a permanent ID for a user (e.g., `did:plc:abc123`) |
| **Handle** | A human-readable username (e.g., `alice.bsky.social`) that maps to a DID |
| **XRPC** | The RPC protocol AT Proto uses. Methods are namespaced (e.g., `com.atproto.repo.createRecord`) |
| **Lexicon** | AT Proto's schema language. Defines the shape of every API call and record type |
| **MST** | Merkle Search Tree - a cryptographically verifiable data structure that stores all of a user's records |
| **CID** | Content Identifier - a hash-based address for a piece of data |
| **CBOR** | Concise Binary Object Representation - a compact binary format (like JSON but smaller) |
| **Repo** | A user's complete data repository, structured as an MST |
| **Sequencer** | Produces an ordered stream of events (the "firehose") for federation |
| **AppView** | A service that indexes data from many PDS instances to build feeds and search |
| **Relay** | A service that aggregates repo events from many PDS instances |
