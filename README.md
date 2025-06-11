# Advanced Ledger Wallet System

This project implements a high-performance, production-grade ledger wallet system using a NestJS and Nx-based microservices architecture. It is a robust wallet  system that mimics key blockchain concepts like a mempool and blocks to ensure data integrity, high throughput, and scalability.

## Overview

The system is composed of two primary microservices:

1. **API Service (apps/api)** – Exposes a secure, versioned RESTful API for all client interactions, including user authentication, account management, wallet management, and transaction submission.

2. **Processor Service (apps/consumer)** – A background worker that operates as the heart of the ledger. It asynchronously processes transactions from a queue, executes the double-entry accounting, and batches confirmed transactions into immutable blocks.

The project leverages Nx monorepo tooling for a clean, scalable codebase, with core business logic encapsulated in feature-based modules within the `libs/` directory.

## High-Level Design & Performance

The architecture is designed for high performance and resilience by decoupling transaction submission from execution, a pattern inspired by blockchain technology.

- **Asynchronous Processing & Instant API Response**: When a user submits a transfer via the API, the transaction is validated and immediately placed into a Mempool (a Redis queue). The API responds instantly with a `202 Accepted` status, providing a responsive user experience. The heavy lifting of balance updates and ledger entries is handled asynchronously by the Processor Service.

- **Scalability & Resilience**:
  - The api service can be scaled horizontally to handle high volumes of incoming requests without being slowed down by database-intensive operations.
  - The processor service can also be scaled to increase transaction throughput.
  - Using Redis as a message queue ensures that even if the processor restarts, pending transactions are not lost and will be processed once the service is back online.

- **Data Integrity**: All balance updates are performed within atomic database transactions by the Processor Service. Transactions are grouped into immutable, hash-linked Blocks, creating a verifiable and auditable history, similar to a blockchain ledger.

## Architecture

### Microservices

**API Service (apps/api)**
- Handles client requests (user registration, login, transfers, data queries) via HTTP.
- Responsible for request validation, authentication, and authorization.
- Submits valid transactions to the Redis mempool for asynchronous processing.

**Processor Service (apps/consumer)**
- Contains the core Transaction Processor.
- Continuously pulls transaction data from the Redis mempool.
- Executes the double-entry accounting logic within atomic database transactions.
- Batches confirmed transactions and creates new blocks in the ledger using the BlockService.
- Can also handle other background tasks like sending email notifications via Kafka.

### Feature-Based Modular Design (libs/)

1. **libs/common/** – Shared Utilities and Core Infrastructure
   - RedisCache Module: Provides a robust, injectable service for Redis, used for both application caching and as a queue for the mempool.
   - BlockModule: Responsible for creating hash-linked blocks.
   - KeyVault Module: A secure wrapper for secret management using AWS KMS, HashiCorp Vault, or a local file-based driver for development. Used to encrypt highly sensitive data like wallet recovery mnemonics.
   - TransactionQueue Module: A simple service for interacting with the Redis mempool list.
   - Logger Module: Provides a context-aware, injectable logging service for the entire application.
   - Kafka & Email Modules: Your existing modules for other event-driven tasks.

2. **libs/auth/** – Authentication & Authorization
   - Handles JWT-based user authentication and verification.
   - Upon successful registration, publishes an event to trigger wallet creation.

3. **libs/wallets/** – Wallet & Account Management
   - Manages the core user-facing logic: creating currency-specific accounts, submitting transfers, and querying balances and transaction history.
   - Contains the WalletService.

4. **libs/persistence/** – Database Entities
   - Defines the TypeORM entities (User, Wallet, Account, Transaction, Block) that map to the PostgreSQL database schema.

### Infrastructure & Deployment (docker-compose.yml)

The system is fully containerized using Docker Compose, providing a one-command local development environment.

**Core Services:**
- PostgreSQL: The primary ACID-compliant database for ledger data.
- Redis: Serves as a high-speed in-memory cache and as the queue (mempool) for pending transactions.
- Vault: A local, developer instance of HashiCorp Vault for secure secret management.
- Kafka + Zookeeper: For other asynchronous eventing needs like notifications.

**Microservices Deployment:**
- Each service (api and consumer) runs in a separate, isolated container.
- The api service runs on port 9230 and is configured with `RUN_TX_PROCESSOR=false`.
- The consumer service runs in the background with `RUN_TX_PROCESSOR=true`, dedicating it to processing the transaction queue.

## Tech Stack

- **Backend**: NestJS, TypeScript, Nx Monorepo
- **Database**: PostgreSQL with TypeORM
- **Queue & Cache**: Redis
- **Secret Management**: HashiCorp Vault (or AWS KMS)
- **Message Queue**: Apache Kafka
- **Containerization**: Docker & Docker Compose

## Security & Best Practices Implemented

- **Asynchronous, Decoupled Architecture**: Ensures high performance and fault tolerance.
- **Secure Secret Management**: Uses KeyVault to encrypt wallet mnemonics, preventing secret exposure even if the database is compromised.
- **Stateful Nonce Management**: Each account has a nonce that is incremented on transaction submission, providing robust protection against replay attacks.
- **Atomic Database Operations**: All ledger balance changes occur within atomic transactions to guarantee data integrity.
- **Immutable Ledger**: Transactions are grouped into hash-linked blocks, creating a verifiable and auditable history.
- **Environment Configuration**: Securely manages all secrets and configurations via .env files.

## Endpoints Implemented

- `POST /auth/register`
- `POST /auth/login`
- `GET /wallet/accounts` - Get all accounts (e.g., NGN, USD) for the authenticated user.
- `POST /wallet/accounts` - Create a new currency account within the user's wallet.
- `GET /wallet/balance/:systemAddress` - Get balance for a specific account.
- `POST /wallet/transfer` - Submits a transfer to the mempool for processing.
- `POST /wallet/reveal-mnemonic` - Securely retrieves the user's recovery phrase.
- `GET /transactions/hash/:hash` - Check the status and details of a specific transaction.
- `GET /transactions/account/:systemAddress` - Get paginated transaction history for an account.
- `GET /blocks/latest` - Get the latest confirmed block.
- `GET /blocks/height/:height` - Get a specific block by its height.
- `GET /blocks/hash/:hash` - Get a specific block by its hash.

## How to Start & Test

### Prerequisites
- Docker & Docker Compose
- Node.js & Yarn

### How to run Application
1. **Configure Environment**: Copy `.env.example` to `.env` and fill in the required variables (database password, JWT secret, etc.). For local development, `KEY_VAULT_PROVIDER` can be set to "local".
2. **Start Services**: 
```sh
yarn docker:up
```

NB: Please do not run `yarn install` before getting the application up and running in docker.

### **Swagger Documentation**

Once the API is running, open:

```
http://localhost:9230/open-api-specs
```

### How to test Application

- Run Unit tests

```sh
yarn install
yarn test
```

- Test on Swagger. Please select the right environment. For this use local.

### **Control Center**

To view Control center, open:

```
http://localhost:9230/open-api-specs
```

## Database Schema

#### 1. `users`

| Column         | Type      | Constraints                 |
| -------------- | --------- | --------------------------- |
| id             | UUID      | Primary Key, Auto-generated |
| email          | VARCHAR   | Unique, Not Null            |
| password\_hash | TEXT      | Not Null                    |
| created\_at    | TIMESTAMP | Auto-generated              |
| updated\_at    | TIMESTAMP | Auto-generated              |

#### 2. `wallets`

| Column                      | Type      | Constraints                                       |
| --------------------------- | --------- | ------------------------------------------------- |
| id                          | UUID      | Primary Key, Auto-generated                       |
| user\_id                    | UUID      | Foreign Key (users.id), Unique, On Delete CASCADE |
| encrypted\_system\_mnemonic | TEXT      | Not Null                                          |
| key\_vault\_key\_id         | VARCHAR   | Not Null                                          |
| salt                        | VARCHAR   | Not Null                                          |
| version                     | INT       | Not Null, Default 1                               |
| created\_at                 | TIMESTAMP | Auto-generated                                    |
| updated\_at                 | TIMESTAMP | Auto-generated                                    |

#### 3. `accounts`

| Column          | Type      | Constraints                                 |
| --------------- | --------- | ------------------------------------------- |
| id              | UUID      | Primary Key, Auto-generated                 |
| wallet\_id      | UUID      | Foreign Key (wallets.id), On Delete CASCADE |
| system\_address | VARCHAR   | Unique, Not Null                            |
| balance         | DECIMAL   | Not Null, Default 0                         |
| locked          | DECIMAL   | Not Null, Default 0                         |
| nonce           | BIGINT    | Not Null, Default 0                         |
| currency        | VARCHAR   | Not Null                                    |
| created\_at     | TIMESTAMP | Auto-generated                              |
| updated\_at     | TIMESTAMP | Auto-generated                              |

#### 4. `blocks`

| Column                | Type        | Constraints                 |
| --------------------- | ----------- | --------------------------- |
| id                    | UUID        | Primary Key, Auto-generated |
| height                | BIGINT      | Unique, Not Null            |
| block\_hash           | VARCHAR(64) | Unique, Not Null            |
| previous\_block\_hash | VARCHAR(64) | Nullable                    |
| timestamp             | TIMESTAMP   | Auto-generated              |
| merkle\_root          | VARCHAR(64) | Nullable                    |
| created\_at           | TIMESTAMP   | Auto-generated              |

#### 3. `transactions`

| Column            | Type         | Constraints                                           |
| ----------------- | ------------ | ----------------------------------------------------- |
| id                | UUID         | Primary Key, Auto-generated                           |
| system\_hash      | VARCHAR      | Unique, Not Null                                      |
| from\_account\_id | UUID         | Foreign Key (accounts.id), On Delete RESTRICT         |
| to\_account\_id   | UUID         | Foreign Key (accounts.id), On Delete RESTRICT         |
| block\_id         | UUID         | Foreign Key (blocks.id), Nullable, On Delete SET NULL |
| block\_height     | BIGINT       | Nullable                                              |
| amount            | DECIMAL      | Not Null                                              |
| fee               | DECIMAL      | Not Null, Default 0                                   |
| currency          | VARCHAR      | Not Null                                              |
| status            | ENUM         | `PENDING`, `PROCESSING`, `CONFIRMED`, `FAILED`, etc.  |
| type              | ENUM         | `TRANSFER`, `DEPOSIT`, `WITHDRAWAL`, etc.             |
| account\_nonce    | BIGINT       | Not Null                                              |
| description       | VARCHAR(255) | Nullable                                              |
| created\_at       | TIMESTAMP    | Auto-generated                                        |
| updated\_at       | TIMESTAMP    | Auto-generated                                        |


# Future Improvements & Scalability

While the current architecture is robust, several areas can be enhanced as the system scales.

1. **Domain & Module Separation**

**Separate Ledger and Wallets Modules**: Currently, the BlockController and the TransactionControlelr are provided via the WalletsModule and a ProcessorModule. A cleaner separation would be to move them into their own dedicated LedgerModule (libs/ledger). This would create a clear boundary:

**WalletsModule**: Manages user-facing concerns (accounts, balances, initiating transfers).

**LedgerModule**: Manages the internal, core ledger mechanics (processing transactions, creating blocks).

This separation reduces module coupling, making the system easier to maintain and test independently.

2. **Database Performance Optimization**

**Read Replicas**: For read-heavy operations like fetching transaction histories or block data, the system can be configured to use PostgreSQL read replicas. This offloads work from the primary write database, improving overall performance and availability. A separate read-only database connection would be used by services that only query data.

**Database Indexing**: As data grows, analyzing slow queries (EXPLAIN ANALYZE) and adding appropriate indexes to the database tables (transactions, accounts) will be critical for maintaining fast query performance.

3. **Enhanced Caching Strategy**

**Transaction Status Caching**: The status of a pending transaction (PENDING, PROCESSING) can be cached in Redis to provide faster API responses when a user polls for an update, reducing database hits.

**User-Level Caching**: Frequently accessed user data or wallet details could be cached to speed up repeated lookups during the authentication or request lifecycle.

4. **Advanced Transaction Processing**

**Parallel Processing**: The current TransactionProcessorService processes transactions from the mempool sequentially. For massive scale, this could be parallelized. Multiple processor instances could work on different transactions concurrently, provided a robust distributed locking mechanism (like the one implemented on Redis) is in place to prevent race conditions.

**Prioritized Mempool**: Instead of a simple FIFO queue (Redis list), a Redis Sorted Set could be used for the mempool. This would allow transactions with higher fees to be processed first, creating a fee market similar to real blockchains.

5. **Security and Observability**

**Full Observability Stack**: Integrate a complete observability solution (e.g., OpenTelemetry) to provide distributed tracing across the api and consumer services. This is invaluable for debugging issues in a microservices environment.

**Dead-Letter Queue (DLQ) Management**: The system moves failed transactions to a DLQ in Redis. A separate monitoring tool or administrative endpoint should be created to inspect, retry, or manually resolve these failed transactions.