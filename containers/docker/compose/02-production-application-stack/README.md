# Lab 02 — Production Application Stack

## What I Investigated

I built and operated a multi-container application with Docker Compose to investigate service isolation, internal networking, service discovery, persistent storage, health-aware startup, and basic failure recovery.

The stack consists of:

* Nginx reverse proxy
* Node.js API
* PostgreSQL
* Redis
* Two isolated Docker networks
* Persistent PostgreSQL storage

The main focus was understanding how to derive the Compose configuration from the application architecture rather than treating the Compose file as a collection of unrelated directives.

## Why I Investigated It

Lab 1 established the basic Compose application model.

For this lab, I wanted to investigate a more realistic application topology where not every service should be directly reachable from the host.

The key design requirement was:

```text
Internet / Host
      |
    Nginx
      |
     API
    /   \
Postgres Redis
```

The database and Redis services should remain internal to the Compose application.

## Architecture

```text
                         Host
                          |
                       :8080
                          |
                          v
                    +-----------+
                    |   Nginx   |
                    |  Proxy    |
                    +-----------+
                          |
                    frontend network
                          |
                          v
                    +-----------+
                    |    API    |
                    +-----------+
                      /       \
                     /         \
            backend network    backend network
                 /                 \
                v                   v
         +-----------+       +-----------+
         | PostgreSQL|       |   Redis   |
         +-----------+       +-----------+
                |
                v
         postgres_data
          named volume
```

### Network design

The API is attached to both networks.

```text
frontend:
  nginx
  api

backend:
  api
  postgres
  redis
```

This intentionally prevents Nginx from directly reaching PostgreSQL and Redis.

## Repository Structure

```text
.
├── api/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
├── nginx/
│   └── nginx.conf
├── Dockerfile
├── compose.yaml
├── .dockerignore
└── .gitignore
```

## Implementation

### Nginx

Nginx is the only service published to the host:

```text
localhost:8080 → nginx:80
```

Nginx forwards requests to the API using the Compose service name:

```text
api:3000
```

No static container IP is used.

### API

The API is built locally from the Dockerfile.

It communicates with its dependencies using Compose service names:

```text
DB_HOST=postgres
REDIS_HOST=redis
```

The API exposes:

```text
GET /
GET /health
GET /db
GET /cache
```

The `/health` endpoint checks both PostgreSQL and Redis.

### PostgreSQL

PostgreSQL uses the official image and is connected only to the backend network.

Its data directory is backed by the named volume:

```text
postgres_data
```

PostgreSQL is therefore not directly published to the host.

### Redis

Redis is connected only to the backend network and is not published to the host.

The API verifies Redis connectivity through the `/cache` endpoint.

## Configuration Design

The Compose configuration was derived from the architecture rather than exposing every service by default.

The resulting service-to-network mapping is:

```text
nginx     → frontend
api       → frontend + backend
postgres  → backend
redis     → backend
```

This creates the following communication paths:

```text
nginx     → api
api       → postgres
api       → redis
```

while preventing:

```text
nginx     → postgres
nginx     → redis
host      → postgres
host      → redis
```

This follows the principle of exposing only the service that needs external access.

## Validation

I validated the Compose configuration before starting the application using:

```bash
docker compose config
```

I also used:

```bash
docker compose config --services
```

to verify that the expected services were present.

Docker documents `docker compose config` as the command that parses, resolves, and renders the Compose model that will be applied to the Docker Engine.

## Experiments

### 1. Verify the application stack

I started the stack with:

```bash
docker compose up --build -d
```

and inspected the running services using:

```bash
docker compose ps
```

`docker compose ps` provides the current service/container state and published ports.

I verified the application through the Nginx entry point:

```bash
curl http://localhost:8080/
curl http://localhost:8080/health
curl http://localhost:8080/db
curl http://localhost:8080/cache
```

The important design observation was that the API itself did not need a host port because Nginx could reach it through the Compose network.

### 2. Verify published ports

I inspected the containers using:

```bash
docker compose ps
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

The intended exposure was:

```text
Nginx     → published to host
API       → internal
Postgres  → internal
Redis     → internal
```

This keeps the database and cache outside the host's externally reachable service surface.

### 3. Verify service discovery

From the API container:

```bash
docker compose exec api sh
```

I tested:

```bash
getent hosts postgres
getent hosts redis
```

The services were addressable by their Compose service names rather than fixed IP addresses.

This is important because container IP addresses are not stable across container recreation, while service-name discovery is designed to remain usable. Docker documents service-name based communication as the normal Compose networking model.

### 4. Verify network isolation

I inspected the network topology and verified that:

```text
frontend
├── nginx
└── api

backend
├── api
├── postgres
└── redis
```

I then entered the Nginx container and attempted to resolve PostgreSQL:

```bash
docker compose exec nginx sh
getent hosts postgres
```

PostgreSQL was not available through Nginx's network because Nginx and PostgreSQL do not share a network.

The API, however, is connected to both networks and can communicate with both backend dependencies.

This demonstrated that Compose networks can be used as an application-level communication boundary.

### 5. Verify Redis is internal

Redis was not published to the host.

The API was still able to communicate with Redis:

```bash
curl http://localhost:8080/cache
```

This demonstrated the difference between:

```text
host accessibility
```

and:

```text
container-to-container accessibility
```

A service does not need a published host port to be usable by another service on a shared Docker network.

### 6. Test dependency failure

I stopped Redis:

```bash
docker compose stop redis
```

I then checked the API health endpoint:

```bash
curl http://localhost:8080/health
```

The API health state reflected the Redis dependency failure.

I checked the Compose state with:

```bash
docker compose ps
```

I then started Redis again:

```bash
docker compose start redis
```

After Redis became healthy, I verified the application again through:

```bash
curl http://localhost:8080/health
```

This demonstrated that application health is different from simply checking whether the API container is running.

### 7. Recreate the API

I recreated the API container:

```bash
docker compose up -d --force-recreate api
```

I then verified:

```bash
curl http://localhost:8080/db
curl http://localhost:8080/cache
```

The API continued communicating with PostgreSQL and Redis through their service names.

This demonstrated why applications should not depend on container IP addresses.

### 8. Verify PostgreSQL persistence

I stopped the Compose application:

```bash
docker compose down
```

and started it again:

```bash
docker compose up -d
```

The PostgreSQL data volume was retained because the named volume was not removed.

I separately tested:

```bash
docker compose down -v
```

which removes the Compose-managed named volumes.

This demonstrated an important operational distinction:

```text
docker compose down
```

does not have the same data-destruction effect as:

```text
docker compose down -v
```

The latter must therefore be treated carefully when persistent services are involved.

### 9. Inspect logs and runtime state

I used:

```bash
docker compose logs --tail=50 nginx
docker compose logs --tail=50 api
docker compose logs --tail=50 postgres
docker compose logs --tail=50 redis
```

and:

```bash
docker compose top
```

Docker provides `docker compose logs` for inspecting service output and `docker compose exec` for running commands inside an existing container.

## Troubleshooting

### Stale image/container state

During the lab, the following command failed:

```bash
docker compose images
```

with:

```text
Error response from daemon:
No such image: sha256:7b5a4dd8df4fa675f1791b2738d86071ccdce55f56149352fad8da68e0ac07d5
```

`docker compose images` lists images associated with the created containers, so this indicated that the existing Compose container state referenced an image digest that was no longer available in the local image store.

I investigated the Compose/container state rather than immediately performing destructive cleanup.

The recovery was:

```bash
docker compose down --remove-orphans
docker compose build --no-cache api
docker compose up -d
```

After recreating the application state, `docker compose images` worked again.

I deliberately did not use:

```bash
docker compose down -v
```

because the PostgreSQL named volume was not part of the image-state problem and removing it would have unnecessarily destroyed persistent data.

Docker documents `--remove-orphans` as removing containers for services that are no longer defined in the Compose project, while `down -v` additionally removes named volumes.

### Engineering implication

The incident reinforced that Compose troubleshooting should distinguish between:

```text
configuration state
container state
image state
network state
volume state
```

A stale container/image problem does not automatically justify deleting persistent volumes.

The appropriate response is to inspect the current state and make the smallest corrective change.

## Findings

### Finding 1 — Network topology can enforce service boundaries

Using two Compose networks allowed the API to communicate with both the frontend-facing proxy and backend dependencies without exposing PostgreSQL or Redis to the host.

### Finding 2 — Service names are preferable to container IP addresses

The API and Nginx communicate with dependencies using service names such as:

```text
api
postgres
redis
```

This avoids coupling the application configuration to container IP addresses.

### Finding 3 — Published ports and internal connectivity are separate concerns

PostgreSQL and Redis can be fully functional without publishing their ports to the host.

Only Nginx needs host-level exposure in this architecture.

### Finding 4 — Health checks provide more useful dependency state than process existence

The API's health endpoint checked both PostgreSQL and Redis.

This made it possible to distinguish a running API process from an application whose dependencies were actually available.

### Finding 5 — Persistent volumes must be treated separately from container lifecycle

Removing containers does not inherently require removing persistent storage.

Using:

```bash
docker compose down
```

and:

```bash
docker compose down -v
```

has materially different consequences for stateful services.

### Finding 6 — Compose troubleshooting requires state inspection

The stale image/container incident showed that a Compose configuration can be correct while the existing Docker state is inconsistent.

The recovery required resource reconciliation rather than changing the application architecture.

## Production Implications

This lab is closer to a production-style single-host topology than Lab 1, but it is not a production deployment.

The following areas remain intentionally outside this lab:

* secret management
* environment-specific Compose overrides
* TLS termination
* image digest pinning
* resource limits
* centralized logging
* backup and restore automation
* vulnerability scanning
* CI/CD deployment
* high availability
* database replication

These are deferred because they belong to the later Compose labs rather than being added only to make this lab appear more advanced.

Docker documents Compose as suitable for single-server deployments and describes production-specific Compose configuration such as restart policies, environment changes, port changes, and additional production overrides.

## Conclusion

This lab moved my Compose understanding from defining multiple containers to designing the application's communication boundaries.

The main lesson was that a Compose file should be derived from the architecture:

```text
architecture
    ↓
services
    ↓
communication paths
    ↓
networks
    ↓
persistent state
    ↓
health/dependency behavior
    ↓
host exposure
```

The resulting configuration was not simply a list of containers. It encoded which services could communicate, which services were externally reachable, which state had to persist, and how service health affected startup and operation.

## Remaining Questions

* How should credentials and other sensitive configuration be handled without embedding them directly in the Compose file?
* How should development and production Compose configurations be separated without duplicating configuration?
* How should image versions and digests be managed for reproducible deployments?
* What additional controls are appropriate for hardening Compose services?
* How should this single-host Compose deployment fit into a CI/CD workflow?
* What changes when the application needs multi-host orchestration and high availability?
