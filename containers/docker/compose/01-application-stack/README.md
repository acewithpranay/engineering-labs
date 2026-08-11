# 01 — Application Stack

## Objective

Build and operate a small multi-container application using Docker Compose.

The purpose of this lab is not simply to run multiple containers. The focus is on understanding how to design and write a `compose.yaml` from an application architecture, validate the configuration, operate the stack, troubleshoot failures, and understand the relationship between services, networking, health checks, and persistent storage.

The stack consists of:

* Node.js API
* PostgreSQL 18
* Docker Compose-managed networking
* Persistent PostgreSQL storage

---

## Architecture

```text
                    Client
                      |
                      | :8080
                      v
              +----------------+
              |   Node.js API  |
              |    :3000       |
              +----------------+
                      |
                      | Compose network
                      |
                      v
              +----------------+
              |  PostgreSQL 18 |
              |     :5432      |
              +----------------+
                      |
                      v
              +----------------+
              | postgres_data  |
              | Named Volume   |
              +----------------+
```

Only the API is exposed to the host.

PostgreSQL is intentionally not published to the host because it is an internal dependency of the API.

---

## Repository Structure

```text
01-application-stack/
├── app/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
├── .dockerignore
├── .gitignore
├── compose.yaml
├── Dockerfile
└── README.md
```

---

## Environment

The lab was performed on:

* OS: Ubuntu 24.04.4 LTS
* Platform: AWS EC2
* Docker version: `Docker version 29.7.2, build a7dcaa6`
* Docker Compose version: `v5.4.0`

---

## Application

The application is a small Node.js API built with Express and PostgreSQL.

The API provides three endpoints:

```text
GET /
GET /health
GET /db
```

### `/`

Used to verify that the API is reachable.

### `/health`

Checks both the API and PostgreSQL connectivity.

The endpoint returns a healthy status only when the API can successfully communicate with PostgreSQL.

### `/db`

Executes a PostgreSQL query and returns database information.

This endpoint is used to verify that communication between the API and PostgreSQL is actually working rather than simply verifying that both containers are running.

---

# Compose Design

The Compose application contains two services:

```text
services
├── api
└── postgres
```

## API service

The API:

* is built locally using the Dockerfile
* listens on container port `3000`
* publishes host port `8080`
* receives database configuration through environment variables
* depends on PostgreSQL
* uses a PostgreSQL healthcheck as the dependency condition
* has its own healthcheck
* uses `restart: unless-stopped`

## PostgreSQL service

PostgreSQL:

* uses the official PostgreSQL 18 Alpine image
* initializes the application database and user
* stores data in a named Docker volume
* has a PostgreSQL healthcheck
* uses `restart: unless-stopped`
* is not exposed directly to the host

---

# YAML / Compose Concepts Practiced

This lab was used to practice writing the following Compose structure:

```yaml
services:
  api:
    build:
    ports:
    environment:
    depends_on:
    healthcheck:
    restart:

  postgres:
    image:
    environment:
    volumes:
    healthcheck:
    restart:

volumes:
```

The main YAML concepts practiced were:

* mappings
* nested mappings
* sequences
* indentation
* quoting
* hierarchical configuration
* service-level configuration
* top-level resources

The main Compose concepts practiced were:

* `services`
* `build`
* `image`
* `ports`
* `environment`
* `volumes`
* `depends_on`
* `healthcheck`
* `restart`
* service-to-service DNS
* named volumes
* Compose project resources

---

# Validation

Before starting the application, the Compose configuration was validated with:

```bash
docker compose config
```

Result:

```text
name: 01-application-stack
services:
  api:
    build:
      context: /home/ubuntu/01-application-stack
      dockerfile: Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
        required: true
    environment:
      DB_HOST: postgres
      DB_NAME: compose_lab
      DB_PASSWORD: compose_password
      DB_PORT: "5432"
      DB_USER: compose
      PORT: "3000"
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - 'require(''http'').get(''http://127.0.0.1:3000/health'', (res) => process.exit(res.statusCode
          === 200 ? 0 : 1)).on(''error'', () => process.exit(1))'
      timeout: 5s
      interval: 10s
      retries: 5
      start_period: 10s
    networks:
      default: null
    ports:
      - mode: ingress
        target: 3000
        published: "8080"
        protocol: tcp
    restart: unless-stopped
  postgres:
    environment:
      POSTGRES_DB: compose_lab
      POSTGRES_PASSWORD: compose_password
      POSTGRES_USER: compose
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U compose -d compose_lab
      timeout: 5s
      interval: 10s
      retries: 5
      start_period: 10s
    image: postgres:18-alpine
    networks:
      default: null
    restart: unless-stopped
    volumes:
      - type: volume
        source: postgres_data
        target: /var/lib/postgresql
        volume: {}
networks:
  default:
    name: 01-application-stack_default
volumes:
  postgres_data:
    name: 01-application-stack_postgres_data
```

The purpose of this step was to validate the Compose configuration before relying on runtime behavior.

---

# Implementation

## Build and Start

The stack was built and started using:

```bash
docker compose up --build -d
```

This resulted in Compose:

1. pulling the PostgreSQL image
2. building the API image
3. creating the Compose network
4. creating the PostgreSQL named volume
5. creating the service containers
6. starting PostgreSQL
7. evaluating the PostgreSQL health status
8. starting the API after the dependency condition was satisfied

Actual result after the final fix:

```text
[+] Building 0.5s (12/12) FINISHED                                                                                                                                                  
 => [internal] load local bake definitions                                                                                                                                     0.0s
 => => reading from stdin 532B                                                                                                                                                 0.0s
 => [internal] load build definition from Dockerfile                                                                                                                           0.0s
 => => transferring dockerfile: 200B                                                                                                                                           0.0s
 => [internal] load metadata for docker.io/library/node:22-alpine                                                                                                              0.1s
 => [internal] load .dockerignore                                                                                                                                              0.0s
 => => transferring context: 2B                                                                                                                                                0.0s
 => [1/5] FROM docker.io/library/node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32                                                        0.0s
 => => resolve docker.io/library/node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32                                                        0.0s
 => [internal] load build context                                                                                                                                              0.0s
 => => transferring context: 136B                                                                                                                                              0.0s
 => CACHED [2/5] WORKDIR /app                                                                                                                                                  0.0s
 => CACHED [3/5] COPY app/package*.json ./                                                                                                                                     0.0s
 => CACHED [4/5] RUN npm ci --omit=dev                                                                                                                                         0.0s
 => CACHED [5/5] COPY app/server.js ./                                                                                                                                         0.0s
 => exporting to image                                                                                                                                                         0.1s
 => => exporting layers                                                                                                                                                        0.0s
 => => exporting manifest sha256:a1a268871a8fe43b82a95786365b8f041aaad16d18b93e9943b20340b809c1df                                                                              0.0s
 => => exporting config sha256:c4129895bdda2dacf0c74dcd6b2b13de24eef6c4145852bc69dddece0c53f1a6                                                                                0.0s
 => => exporting attestation manifest sha256:e9b35bd75321696119dd7d9890a5c4f7e290000f6ba075e00a334285dae3896e                                                                  0.0s
 => => exporting manifest list sha256:01222c671c49d11a2ad75b08f3218f03a715e75cb20f0846821194f9a6c33386                                                                         0.0s
 => => naming to docker.io/library/01-application-stack-api:latest                                                                                                             0.0s
 => => unpacking to docker.io/library/01-application-stack-api:latest                                                                                                          0.0s
 => resolving provenance for metadata file                                                                                                                                     0.0s
[+] up 5/5
 ✔ Image 01-application-stack-api            Built                                                                                                                              0.6s
 ✔ Network 01-application-stack_default      Created                                                                                                                            0.1s
 ✔ Volume 01-application-stack_postgres_data Created                                                                                                                            0.0s
 ✔ Container 01-application-stack-postgres-1 Healthy                                                                                                                            5.9s
 ✔ Container 01-application-stack-api-1      Started                                                                                                                            6.0s
```

---

# Experiments

## Experiment 1 — Compose Application Startup

### Command

```bash
docker compose up --build -d
```

### Verification

```bash
docker compose ps
```

### Observation

```text
NAME                              IMAGE                      COMMAND                  SERVICE    CREATED         STATUS                   PORTS
01-application-stack-api-1        01-application-stack-api   "docker-entrypoint.s…"   api        3 minutes ago   Up 3 minutes (healthy)   0.0.0.0:8080->3000/tcp, [::]:8080->3000/tcp
01-application-stack-postgres-1   postgres:18-alpine         "docker-entrypoint.s…"   postgres   3 minutes ago   Up 3 minutes (healthy)   5432/tcp
```

### Conclusion

The Compose file can define the application as a group of services and allow the complete stack to be created and started using a single command.

---

## Experiment 2 — API Connectivity

### Command

```bash
curl http://localhost:8080/
```

### Observation

```text
{"application":"compose-lab-01-api","status":"running"}
```

### Conclusion

The host can reach the API through the published port mapping:

```text
Host :8080
    |
    v
API container :3000
```

---

## Experiment 3 — Application Health

### Command

```bash
curl http://localhost:8080/health
```

### Observation

```text
{"status":"healthy","database":"reachable"}
```

### Conclusion

The health endpoint verifies more than container availability. It verifies that the API can communicate with PostgreSQL.

---

## Experiment 4 — Database Connectivity

### Command

```bash
curl http://localhost:8080/db
```

### Observation

```text
{"status":"connected","database":"compose_lab","server_time":"2026-08-11T13:58:35.115Z"}
```

### Conclusion

The API successfully communicates with PostgreSQL through the Compose network.

The API does not need the PostgreSQL container IP address.

It uses the Compose service name:

```text
postgres
```

as the database hostname.

---

## Experiment 5 — Compose Service DNS

### Command

```bash
docker compose exec api sh
```

Then:

```bash
getent hosts postgres
```

### Observation

```text
/app $ getent hosts postgres
172.18.0.2        postgres  postgres
```

### Conclusion

The API container can resolve the PostgreSQL service using the Compose service name.

This demonstrates why applications should reference other Compose services by service name rather than relying on container IP addresses.

---

# Persistent Storage Investigation

PostgreSQL data was configured using a named Docker volume:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql
```

The purpose of this configuration is to keep database data outside the lifecycle of the PostgreSQL container.

---

## Experiment 6 — Container Recreation

### Steps

```bash
docker compose down
docker compose up -d
```

### Observation

```text
root@ip-10-0-12-83:/home/ubuntu/01-application-stack# docker compose down
[+] down 3/3
 ✔ Container 01-application-stack-api-1      Removed                                                                                                                           10.2s
 ✔ Container 01-application-stack-postgres-1 Removed                                                                                                                            0.2s
 ✔ Network 01-application-stack_default      Removed                                                                                                                            0.0s
root@ip-10-0-12-83:/home/ubuntu/01-application-stack# docker compose up -d
[+] up 3/3
 ✔ Network 01-application-stack_default      Created                                                                                                                            0.1s
 ✔ Container 01-application-stack-postgres-1 Healthy                                                                                                                            5.9s
 ✔ Container 01-application-stack-api-1      Started                                                                                                                            6.1s
```

### Conclusion

The PostgreSQL container can be removed and recreated while the named volume remains available.

This demonstrates the difference between container lifecycle and persistent data lifecycle.

---

## Experiment 7 — Volume Deletion

### Steps

```bash
docker compose down -v
docker compose up -d
```

### Observation

```text
[+] down 4/4
 ✔ Container 01-application-stack-api-1      Removed                                                                                                                           10.2s
 ✔ Container 01-application-stack-postgres-1 Removed                                                                                                                            0.2s
 ✔ Network 01-application-stack_default      Removed                                                                                                                            0.1s
 ✔ Volume 01-application-stack_postgres_data Removed                                                                                                                            0.1s
root@ip-10-0-12-83:/home/ubuntu/01-application-stack# docker compose up -d
[+] up 4/4
 ✔ Network 01-application-stack_default      Created                                                                                                                            0.1s
 ✔ Volume 01-application-stack_postgres_data Created                                                                                                                            0.0s
 ✔ Container 01-application-stack-postgres-1 Healthy                                                                                                                            5.9s
 ✔ Container 01-application-stack-api-1      Started                                                                                                                            6.0s
```

### Conclusion

Removing the named volume removes the persistent PostgreSQL data associated with the lab.

This demonstrated why:

```bash
docker compose down
```

and:

```bash
docker compose down -v
```

must not be treated as equivalent operations when persistent data is involved.

---

# Service Dependency Investigation

The API uses:

```yaml
depends_on:
  postgres:
    condition: service_healthy
```

PostgreSQL has its own healthcheck.

The purpose is to avoid treating "container started" as equivalent to "database ready."

---

## Experiment 8 — Startup Dependency

### Command

```bash
docker compose up
```

### Observation

```text
[+] up 4/4
 ✔ Network 01-application-stack_default      Created                                                                                                                            0.1s
 ✔ Volume 01-application-stack_postgres_data Created                                                                                                                            0.0s
 ✔ Container 01-application-stack-postgres-1 Created                                                                                                                            0.1s
 ✔ Container 01-application-stack-api-1      Created                                                                                                                            0.1s
Attaching to api-1, postgres-1
Container 01-application-stack-postgres-1 Waiting 
postgres-1  | The files belonging to this database system will be owned by user "postgres".
postgres-1  | This user must also own the server process.
postgres-1  | 
postgres-1  | The database cluster will be initialized with locale "en_US.utf8".
postgres-1  | The default database encoding has accordingly been set to "UTF8".
postgres-1  | The default text search configuration will be set to "english".
postgres-1  | 
postgres-1  | Data page checksums are enabled.
postgres-1  | 
postgres-1  | fixing permissions on existing directory /var/lib/postgresql/18/docker ... ok
postgres-1  | creating subdirectories ... ok
postgres-1  | selecting dynamic shared memory implementation ... posix
postgres-1  | selecting default "max_connections" ... 100
postgres-1  | selecting default "shared_buffers" ... 128MB
postgres-1  | selecting default time zone ... UTC
postgres-1  | creating configuration files ... ok
postgres-1  | running bootstrap script ... ok
postgres-1  | sh: locale: not found
postgres-1  | 2026-08-11 14:05:04.139 UTC [38] WARNING:  no usable system locales were found
postgres-1  | performing post-bootstrap initialization ... ok
postgres-1  | syncing data to disk ... ok
postgres-1  | 
postgres-1  | initdb: warning: enabling "trust" authentication for local connections
postgres-1  | 
postgres-1  | Success. You can now start the database server using:
postgres-1  | 
postgres-1  |     pg_ctl -D /var/lib/postgresql/18/docker -l logfile start
postgres-1  | 
postgres-1  | initdb: hint: You can change this by editing pg_hba.conf or using the option -A, or --auth-local and --auth-host, the next time you run initdb.
postgres-1  | waiting for server to start....2026-08-11 14:05:04.745 UTC [44] LOG:  starting PostgreSQL 18.4 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
postgres-1  | 2026-08-11 14:05:04.748 UTC [44] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
postgres-1  | 2026-08-11 14:05:04.758 UTC [50] LOG:  database system was shut down at 2026-08-11 14:05:04 UTC
postgres-1  | 2026-08-11 14:05:04.763 UTC [44] LOG:  database system is ready to accept connections
postgres-1  |  done
postgres-1  | server started
postgres-1  | CREATE DATABASE
postgres-1  | 
postgres-1  | 
postgres-1  | /usr/local/bin/docker-entrypoint.sh: ignoring /docker-entrypoint-initdb.d/*
postgres-1  | 
postgres-1  | 2026-08-11 14:05:04.908 UTC [44] LOG:  received fast shutdown request
postgres-1  | waiting for server to shut down....2026-08-11 14:05:04.912 UTC [44] LOG:  aborting any active transactions
postgres-1  | 2026-08-11 14:05:04.919 UTC [44] LOG:  background worker "logical replication launcher" (PID 53) exited with exit code 1
postgres-1  | 2026-08-11 14:05:04.921 UTC [48] LOG:  shutting down
postgres-1  | 2026-08-11 14:05:04.925 UTC [48] LOG:  checkpoint starting: shutdown immediate
postgres-1  | 2026-08-11 14:05:04.971 UTC [48] LOG:  checkpoint complete: wrote 943 buffers (5.8%), wrote 3 SLRU buffers; 0 WAL file(s) added, 0 removed, 0 recycled; write=0.025 s, sync=0.012 s, total=0.049 s; sync files=303, longest=0.005 s, average=0.001 s; distance=4362 kB, estimate=4362 kB; lsn=0/1BA6828, redo lsn=0/1BA6828
postgres-1  | 2026-08-11 14:05:04.989 UTC [44] LOG:  database system is shut down
postgres-1  |  done
postgres-1  | server stopped
postgres-1  | 
postgres-1  | PostgreSQL init process complete; ready for start up.
postgres-1  | 
postgres-1  | 2026-08-11 14:05:05.040 UTC [1] LOG:  starting PostgreSQL 18.4 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
postgres-1  | 2026-08-11 14:05:05.042 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
postgres-1  | 2026-08-11 14:05:05.042 UTC [1] LOG:  listening on IPv6 address "::", port 5432
postgres-1  | 2026-08-11 14:05:05.045 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
postgres-1  | 2026-08-11 14:05:05.052 UTC [66] LOG:  database system was shut down at 2026-08-11 14:05:04 UTC
postgres-1  | 2026-08-11 14:05:05.058 UTC [1] LOG:  database system is ready to accept connections
Container 01-application-stack-postgres-1 Healthy 
api-1       | API listening on port 3000
```

### Evidence

```bash
docker compose ps
```

and:

```bash
docker compose logs postgres
```

### Conclusion

The API depends on PostgreSQL being healthy before its dependency condition is satisfied.

This demonstrated the difference between:

```text
Container started
```

and:

```text
Application dependency ready
```

---

# Troubleshooting Investigation

## PostgreSQL 18 Startup Failure

The initial implementation of the lab used:

```yaml
postgres:
  image: postgres:18-alpine
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

The application did not start successfully.

Compose reported:

```text
dependency failed to start:
container 01-application-stack-postgres-1 is unhealthy
```

---

## Initial Evidence

The PostgreSQL container was inspected with:

```bash
docker compose logs postgres
```

and:

```bash
docker inspect 01-application-stack-postgres-1 \
  --format 'Status={{.State.Status}} ExitCode={{.State.ExitCode}} Error={{.State.Error}}'
```

The observed container state showed:

```text
Status=restarting
ExitCode=1
```

The PostgreSQL logs indicated that data was present under:

```text
/var/lib/postgresql/data
```

but this was treated as an unused legacy mount by the PostgreSQL 18 image.

---

## Root Cause

The initial Compose configuration used the traditional PostgreSQL data path:

```text
/var/lib/postgresql/data
```

However, the PostgreSQL 18 official image changed its data-directory and volume layout.

The image uses a version-specific `PGDATA` location under:

```text
/var/lib/postgresql/18/docker
```

and declares:

```text
/var/lib/postgresql
```

as its volume.

Therefore, the original volume mount was incompatible with the PostgreSQL 18 image layout.

---

## Fix

The volume mount was changed from:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```

to:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql
```

The stack was then recreated and tested again.

---

## Verification After the Fix

### Compose startup

```bash
docker compose up --build -d
```

Result:

```text
[+] Building 0.6s (12/12) FINISHED                                                                                                                                                  
 => [internal] load local bake definitions                                                                                                                                     0.0s
 => => reading from stdin 532B                                                                                                                                                 0.0s
 => [internal] load build definition from Dockerfile                                                                                                                           0.0s
 => => transferring dockerfile: 200B                                                                                                                                           0.0s
 => [internal] load metadata for docker.io/library/node:22-alpine                                                                                                              0.2s
 => [internal] load .dockerignore                                                                                                                                              0.0s
 => => transferring context: 2B                                                                                                                                                0.0s
 => [1/5] FROM docker.io/library/node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32                                                        0.0s
 => => resolve docker.io/library/node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32                                                        0.0s
 => [internal] load build context                                                                                                                                              0.1s
 => => transferring context: 136B                                                                                                                                              0.1s
 => CACHED [2/5] WORKDIR /app                                                                                                                                                  0.0s
 => CACHED [3/5] COPY app/package*.json ./                                                                                                                                     0.0s
 => CACHED [4/5] RUN npm ci --omit=dev                                                                                                                                         0.0s
 => CACHED [5/5] COPY app/server.js ./                                                                                                                                         0.0s
 => exporting to image                                                                                                                                                         0.1s
 => => exporting layers                                                                                                                                                        0.0s
 => => exporting manifest sha256:a1a268871a8fe43b82a95786365b8f041aaad16d18b93e9943b20340b809c1df                                                                              0.0s
 => => exporting config sha256:c4129895bdda2dacf0c74dcd6b2b13de24eef6c4145852bc69dddece0c53f1a6                                                                                0.0s
 => => exporting attestation manifest sha256:785ff073d5f8e553eff238e771294eeb4d28f96b324dfa9518d85b63b1fdced1                                                                  0.0s
 => => exporting manifest list sha256:ecc98d275498c5579ec90d62778983c181b77f9bd1fbde58ddd8cbd84b79f651                                                                         0.0s
 => => naming to docker.io/library/01-application-stack-api:latest                                                                                                             0.0s
 => => unpacking to docker.io/library/01-application-stack-api:latest                                                                                                          0.0s
 => resolving provenance for metadata file                                                                                                                                     0.0s
[+] up 5/5
 ✔ Image 01-application-stack-api            Built                                                                                                                              0.7s
 ✔ Network 01-application-stack_default      Created                                                                                                                            0.1s
 ✔ Volume 01-application-stack_postgres_data Created                                                                                                                            0.0s
 ✔ Container 01-application-stack-postgres-1 Healthy                                                                                                                            5.9s
 ✔ Container 01-application-stack-api-1      Started                                                                                                                            6.1s
```

### Service status

```bash
docker compose ps
```

Result:

```text
NAME                              IMAGE                      COMMAND                  SERVICE    CREATED          STATUS                    PORTS
01-application-stack-api-1        01-application-stack-api   "docker-entrypoint.s…"   api        46 seconds ago   Up 39 seconds (healthy)   0.0.0.0:8080->3000/tcp, [::]:8080->3000/tcp
01-application-stack-postgres-1   postgres:18-alpine         "docker-entrypoint.s…"   postgres   46 seconds ago   Up 45 seconds (healthy)   5432/tcp
```

### API health

```bash
curl http://localhost:8080/health
```

Result:

```text
{"status":"healthy","database":"reachable"}
```

### Database connectivity

```bash
curl http://localhost:8080/db
```

Result:

```text
{"status":"connected","database":"compose_lab","server_time":"2026-08-11T14:09:12.637Z"}
```

---

# Production Implication

The failure demonstrated an important production lesson:

> A database image major-version upgrade is not necessarily a simple image-tag change.

Before upgrading a stateful service, I need to verify:

* image documentation
* data-directory layout
* volume layout
* initialization behavior
* upgrade/migration requirements
* backup and restore procedure
* compatibility with the existing persistent data
* rollback strategy

The PostgreSQL 18 image change made this visible immediately during the lab.

This is particularly important for persistent services because a container image can change filesystem assumptions while the underlying persistent data survives independently.

---

# Troubleshooting Approach

The main troubleshooting sequence used in this failure was:

```text
Compose reports dependency failure
            |
            v
Identify affected service
            |
            v
Inspect service logs
            |
            v
Inspect container state
            |
            v
Determine whether failure is:
startup / healthcheck / dependency
            |
            v
Identify root cause
            |
            v
Change only the required configuration
            |
            v
Rebuild/recreate
            |
            v
Verify application behavior
```

The important lesson was to avoid changing multiple configuration items before establishing the root cause.

---

# Key Findings

## 1. Compose is an application definition

Instead of manually creating each container with separate `docker run` commands, Compose allows the application topology to be declared in one YAML configuration.

---

## 2. Services communicate using service names

The API connects to PostgreSQL using:

```text
postgres
```

rather than a hard-coded container IP.

This avoids coupling the application to dynamically assigned container addresses.

---

## 3. Container health and container existence are different

A container being started does not necessarily mean the application inside it is ready.

Healthchecks allow the service's operational state to be represented explicitly.

---

## 4. `depends_on` has different behavior depending on its syntax

Simple dependency ordering does not mean that a dependency is healthy.

Using:

```yaml
depends_on:
  postgres:
    condition: service_healthy
```

allows the dependency to be considered ready based on its healthcheck.

---

## 5. Named volumes separate data lifecycle from container lifecycle

The PostgreSQL container can be recreated without necessarily deleting its persistent data.

However:

```bash
docker compose down -v
```

removes the named volume and therefore destroys the persisted lab data.

---

## 6. Database image upgrades require investigation

The PostgreSQL 18 volume-layout change caused the initial implementation to fail.

This demonstrated that version upgrades of stateful services require more than changing an image tag.

---

# Production Considerations

This lab is intentionally a small single-host Compose deployment.

It is **not** being presented as a production-ready database platform.

The following production concerns are intentionally left for later labs:

* proper secret management
* environment-specific configuration
* production Compose overrides
* image digest pinning
* image vulnerability scanning
* container resource limits
* read-only filesystem considerations
* capability reduction
* centralized logging
* monitoring and metrics
* TLS
* reverse proxy
* database backup and restore
* database upgrade strategy
* disaster recovery
* high availability
* CI/CD integration

These will be addressed progressively rather than adding unnecessary complexity to the first lab.

---

# What I Learned

[Write this section in my own words after completing the lab.]

Suggested areas to reflect on:

* How I translate an application architecture into `compose.yaml`
* How YAML nesting maps to Compose structure
* How services communicate inside a Compose network
* Why service names should be used instead of container IP addresses
* Why healthchecks matter
* How `depends_on` interacts with healthchecks
* How named volumes preserve data
* Why `docker compose down` and `docker compose down -v` have different consequences
* What caused the PostgreSQL 18 failure
* What I should verify before upgrading a stateful container image

---

# Conclusions

[Write my actual conclusions based on the experiments.]

The conclusion should focus on what the experiments demonstrated rather than repeating the implementation steps.

---

# Remaining Questions

* How should secrets be managed properly in Docker Compose?
* How should development and production Compose configurations be separated?
* How should Compose networks be designed for a larger application?
* How should resource limits be selected?
* How should logging and monitoring be integrated?
* How should database backup and restore be handled?
* How should Compose deployments be integrated into CI/CD?
* Where does Docker Compose stop being appropriate and an orchestrator become necessary?

---

# References

* Docker Compose Specification
* Docker Compose service reference
* Docker Compose healthcheck and dependency documentation
* Docker official PostgreSQL image documentation
* GitHub repository and security documentation
