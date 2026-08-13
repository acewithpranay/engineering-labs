# 01 — Application Stack

## Objective

I built and operated a small multi-container application using Docker Compose to understand how an application architecture is translated into a `compose.yaml` and how the resulting stack behaves at runtime.

The lab focused on:

* writing Compose YAML from an application architecture
* defining multiple services
* building an application image
* running an existing PostgreSQL image
* configuring service-to-service communication
* using Compose service discovery
* managing persistent storage
* implementing healthchecks
* controlling service startup dependencies
* validating and troubleshooting the Compose configuration

The application consists of a Node.js API and PostgreSQL 18.

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

The API is the only service exposed to the host.

PostgreSQL remains internal to the Compose application because the API is its only consumer.

---

## Environment

The lab was performed on:

* OS: Ubuntu 24.04.4 LTS
* Platform: AWS EC2
* Docker: `29.7.2`
* Docker Compose: `v5.4.0`

---

## Application

I used a small Node.js API built with Express and the PostgreSQL client.

The API exposes three endpoints:

```text
GET /
GET /health
GET /db
```

### `/`

I used this endpoint to verify basic API reachability.

### `/health`

This endpoint performs a database connectivity check and returns a healthy response only when PostgreSQL is reachable.

This allowed me to distinguish between:

```text
API container is running
```

and:

```text
API and its database dependency are actually working
```

### `/db`

This endpoint executes a PostgreSQL query and returns the connected database and server time.

I used it to verify actual application-to-database communication.

---

## Compose Design

I defined two services:

```text
services
├── api
└── postgres
```

### API

The API service:

* is built locally from the Dockerfile
* listens on container port `3000`
* publishes host port `8080`
* receives PostgreSQL connection details through environment variables
* depends on PostgreSQL being healthy
* has its own healthcheck
* uses `restart: unless-stopped`

### PostgreSQL

The PostgreSQL service:

* uses `postgres:18-alpine`
* initializes the application database and user
* uses a named volume for persistent storage
* has a PostgreSQL healthcheck
* uses `restart: unless-stopped`
* does not publish port `5432` to the host

---

## Compose Configuration

The resulting Compose structure is:

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

This lab gave me practical experience with YAML mappings, nesting, sequences, indentation, quoting, and hierarchical configuration while applying those concepts to the Compose service model.

---

# Validation

Before starting the stack, I validated the Compose configuration with:

```bash
docker compose config
```

The configuration rendered successfully.

The resolved configuration confirmed that Compose generated:

* the `api` service
* the `postgres` service
* the default Compose network
* the `postgres_data` named volume
* the configured port mapping
* the healthchecks
* the `service_healthy` dependency condition

This gave me confidence that the YAML structure was valid before moving to runtime testing.

---

# Experiments and Findings

## 1. Application Startup

I started the application with:

```bash
docker compose up --build -d
```

Compose built the API image, pulled PostgreSQL 18, created the network and volume, and eventually started both services successfully.

The final state was:

```text
NAME                              SERVICE    STATUS
01-application-stack-api-1        api        Up (healthy)
01-application-stack-postgres-1   postgres   Up (healthy)
```

The API was published as:

```text
0.0.0.0:8080 -> 3000/tcp
```

while PostgreSQL remained internal to the Compose network.

### Finding

Compose allowed the complete application topology to be created and managed as a single application rather than requiring separate container lifecycle commands.

---

## 2. API Connectivity

I verified external connectivity with:

```bash
curl http://localhost:8080/
```

The API returned:

```json
{"application":"compose-lab-01-api","status":"running"}
```

### Finding

The host reaches the application through the published port mapping:

```text
Host :8080
     |
     v
API :3000
```

No PostgreSQL port was required on the host.

---

## 3. Application Health

I tested:

```bash
curl http://localhost:8080/health
```

The API returned:

```json
{"status":"healthy","database":"reachable"}
```

### Finding

The health endpoint provided a more meaningful signal than simply checking whether the API container was running.

The API was considered healthy only after it could successfully communicate with PostgreSQL.

---

## 4. Database Connectivity

I tested:

```bash
curl http://localhost:8080/db
```

The API returned:

```json
{
  "status":"connected",
  "database":"compose_lab",
  "server_time":"2026-08-11T13:58:35.115Z"
}
```

### Finding

The API successfully communicated with PostgreSQL over the Compose network.

The application did not need to know PostgreSQL's container IP address.

Instead, it used:

```text
postgres
```

as the database hostname.

This reinforced an important Compose networking principle: service names are the stable application-level reference, while container IP addresses are implementation details.

---

## 5. Compose Service Discovery

I entered the API container:

```bash
docker compose exec api sh
```

and resolved the PostgreSQL service:

```bash
getent hosts postgres
```

The result included:

```text
172.18.0.2    postgres
```

### Finding

The API container could resolve PostgreSQL through the Compose service name.

This confirmed that Compose networking provides service discovery without requiring static IP configuration.

---

# Persistent Storage Investigation

PostgreSQL uses a named volume:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql
```

I specifically used a named volume because database data must not depend on the lifecycle of an individual PostgreSQL container.

---

## 6. Container Recreation

I tested:

```bash
docker compose down
docker compose up -d
```

Compose removed the API and PostgreSQL containers and the network, while the named volume remained.

The stack started successfully again.

### Finding

Container lifecycle and persistent-data lifecycle are separate.

Removing and recreating the PostgreSQL container did not inherently remove the database volume.

---

## 7. Volume Deletion

I then deliberately removed the volume:

```bash
docker compose down -v
docker compose up -d
```

Compose reported that the named volume was removed and subsequently created a new one during startup.

### Finding

The distinction between:

```bash
docker compose down
```

and:

```bash
docker compose down -v
```

is operationally important.

The first removes the application containers and network while retaining the named volume.

The second also removes the named volume and therefore destroys the persisted database data.

This is a critical distinction for any Compose workload containing stateful services.

---

# Startup Dependency Investigation

The API uses:

```yaml
depends_on:
  postgres:
    condition: service_healthy
```

PostgreSQL has a healthcheck based on `pg_isready`.

I intentionally observed the startup process rather than assuming that `depends_on` meant "database is ready."

During startup, Compose showed:

```text
Container 01-application-stack-postgres-1 Waiting
```

PostgreSQL initialized and eventually reported:

```text
database system is ready to accept connections
```

Compose then reported:

```text
Container 01-application-stack-postgres-1 Healthy
```

and the API started:

```text
api-1 | API listening on port 3000
```

### Finding

The important distinction is:

```text
Container started
```

versus:

```text
Dependency is healthy
```

Using:

```yaml
condition: service_healthy
```

made the API dependent on PostgreSQL's health status rather than merely its container startup.

This is consistent with Docker's current Compose behavior: `service_healthy` causes Compose to wait for the dependency's healthcheck to pass before starting the dependent service.

---

# Troubleshooting Investigation

## PostgreSQL 18 Startup Failure

The first implementation of the lab did not start successfully.

I initially configured:

```yaml
postgres:
  image: postgres:18-alpine
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

Compose reported:

```text
dependency failed to start:
container 01-application-stack-postgres-1 is unhealthy
```

At first this looked like a healthcheck problem.

I did not immediately change the healthcheck.

Instead, I investigated the PostgreSQL container.

---

## Evidence

I inspected the PostgreSQL logs:

```bash
docker compose logs postgres
```

and inspected the container state:

```bash
docker inspect 01-application-stack-postgres-1 \
  --format 'Status={{.State.Status}} ExitCode={{.State.ExitCode}} Error={{.State.Error}}'
```

The container was repeatedly restarting with:

```text
Status=restarting
ExitCode=1
```

The PostgreSQL logs indicated that data was present under:

```text
/var/lib/postgresql/data
```

but PostgreSQL 18 treated that location as an unused legacy mount.

This changed the direction of the investigation.

The problem was not that the healthcheck was incorrectly detecting an unhealthy PostgreSQL server.

PostgreSQL itself was failing before it could become healthy.

---

## Root Cause

The initial configuration used the traditional PostgreSQL data path:

```text
/var/lib/postgresql/data
```

However, the PostgreSQL 18 official image changed its data-directory layout.

The image defines:

```text
PGDATA=/var/lib/postgresql/18/docker
```

and declares:

```text
VOLUME /var/lib/postgresql
```

for PostgreSQL 18.

Therefore, the original volume mount was incompatible with the PostgreSQL 18 image layout.

---

## Resolution

I changed the volume mount from:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```

to:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql
```

I then recreated the stack and verified the application again.

---

## Verification After the Fix

The rebuilt stack reported:

```text
✔ Image 01-application-stack-api Built
✔ Network 01-application-stack_default Created
✔ Volume 01-application-stack_postgres_data Created
✔ Container 01-application-stack-postgres-1 Healthy
✔ Container 01-application-stack-api-1 Started
```

The final service state was:

```text
NAME                              SERVICE    STATUS
01-application-stack-api-1        api        Up (healthy)
01-application-stack-postgres-1   postgres   Up (healthy)
```

The API health endpoint returned:

```json
{"status":"healthy","database":"reachable"}
```

The database endpoint returned:

```json
{
  "status":"connected",
  "database":"compose_lab",
  "server_time":"2026-08-11T14:09:12.637Z"
}
```

### Finding

The failure was caused by an image-version-specific filesystem change rather than a Compose dependency or healthcheck problem.

---

# Troubleshooting Approach

This failure reinforced the following troubleshooting sequence:

```text
Compose reports failure
        |
        v
Identify affected service
        |
        v
Inspect logs
        |
        v
Inspect container state
        |
        v
Determine whether the failure is:
startup / healthcheck / dependency
        |
        v
Identify root cause
        |
        v
Change the minimum required configuration
        |
        v
Recreate the affected resources
        |
        v
Verify application behavior
```

The most important lesson was to avoid treating the final Compose error message as the root cause.

In this case:

```text
container is unhealthy
```

was only the symptom.

The actual failure was PostgreSQL terminating because of the incompatible volume layout.

---

# Key Findings

### Compose configuration is an application model

I can represent the application topology in one YAML file instead of managing each container independently.

The important shift is from thinking about individual containers to thinking about the desired state of the application.

### YAML structure maps directly to the application model

The indentation and nesting of YAML determine the relationship between:

```text
services
  |
  +-- api
  |
  +-- postgres
```

and the configuration belonging to each service.

This made the YAML much easier to reason about than memorizing individual Compose keys.

### Service names are more important than container IPs

The API communicates with PostgreSQL using:

```text
postgres
```

rather than a hard-coded IP address.

That keeps the application independent from dynamically assigned container addresses.

### Healthchecks provide application-level readiness

A running container does not necessarily mean its application is ready.

The PostgreSQL healthcheck allowed Compose to distinguish between PostgreSQL being started and PostgreSQL being ready to accept connections.

### `depends_on` does not automatically mean "ready"

The `service_healthy` condition was required to make the API wait for PostgreSQL's healthcheck.

This was different from simply declaring a dependency.

### Volumes have an independent lifecycle

Containers can be removed and recreated while a named volume survives.

Using `down -v` changes that behavior by explicitly deleting the volume.

### Database image upgrades require investigation

The PostgreSQL 18 failure was the most valuable troubleshooting finding in this lab.

Changing:

```text
postgres:<previous-version>
```

to:

```text
postgres:18
```

is not necessarily a harmless configuration change when persistent storage is involved.

The image's filesystem and data-directory behavior must be verified before performing a database major-version upgrade.

---

# Production Considerations

This lab intentionally represents a small single-host Compose deployment rather than a complete production platform.

I identified the following areas that require additional engineering before treating this as production-ready:

* secret management
* environment-specific configuration
* production Compose overrides
* image digest pinning
* image vulnerability scanning
* resource limits
* filesystem and capability hardening
* centralized logging
* monitoring and metrics
* TLS
* reverse proxy
* database backup and restore
* database upgrade strategy
* disaster recovery
* high availability
* CI/CD integration

I will address these progressively rather than adding production complexity before understanding the underlying Compose mechanisms.

---

# What I Learned

This lab changed how I think about writing a Compose file.

I started with the application architecture:

```text
API
 |
PostgreSQL
```

and translated that into:

```text
services
├── api
└── postgres
```

From there, each runtime requirement became a specific part of the Compose configuration:

```text
Application needs to be built
        -> build

Application must be reachable externally
        -> ports

Application needs PostgreSQL configuration
        -> environment

Application depends on PostgreSQL
        -> depends_on

PostgreSQL must be ready before API startup
        -> healthcheck + service_healthy

Database data must survive container recreation
        -> named volume

Containers need to communicate
        -> Compose network
```

The biggest learning was that I do not need to start by remembering every Compose keyword.

I can start from the architecture and derive the YAML from the application's requirements.

The PostgreSQL failure also reinforced an important production habit: when a container fails, I should investigate the actual runtime evidence before changing configuration. The Compose message identified the dependency failure, but the PostgreSQL logs revealed the real cause.

---

# Conclusion

This lab gave me the foundation I need to write a Compose file from an application architecture rather than copy an existing template.

I now understand the relationship between:

```text
YAML structure
      ↓
Compose services
      ↓
Networks
      ↓
Dependencies
      ↓
Health
      ↓
Persistent storage
      ↓
Container lifecycle
```

The most valuable part of the lab was the PostgreSQL 18 failure because it forced me to distinguish between a Compose-level symptom and the actual application failure.

The final implementation successfully demonstrated:

* multi-service Compose configuration
* application image building
* PostgreSQL image usage
* service discovery
* port publishing
* environment-based configuration
* healthchecks
* health-aware dependencies
* persistent volumes
* container recreation
* volume deletion
* runtime troubleshooting

I am treating this lab as the baseline for the more production-oriented Compose work that follows.

---

# Remaining Questions

The next areas I need to investigate are:

* How should secrets be handled without exposing credentials through Compose configuration?
* How should development and production configurations be separated cleanly?
* How should multiple Compose networks be designed to isolate application tiers?
* How should resource limits and container security controls be applied?
* How should Compose applications be integrated into CI/CD?
* How should logging and monitoring be designed?
* How should database backup, restore, and upgrade procedures be incorporated?
* At what point does a Compose workload become unsuitable for a single-host deployment and require an orchestrator?

---

# References

* [Docker Compose Specification](https://docs.docker.com/reference/compose-file/)
* [Docker Compose Services Reference](https://docs.docker.com/reference/compose-file/services/)
* [Docker Compose Quickstart](https://docs.docker.com/compose/gettingstarted/)
* [Docker Official PostgreSQL Image](https://hub.docker.com/_/postgres)
* [GitHub README Documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
