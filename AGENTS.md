# Agent Guide

## Project Shape

- This is an ESM Express 5 API backed by MongoDB through Mongoose.
- Runtime request flow is `route -> controller -> service -> model -> response`.
- The application is assembled in [src/app.js](src/app.js), mounted under `/api`, and started through [main.js](main.js) and [server.js](server.js).
- Use the completed tag feature as the closest end-to-end example: [src/routes/tags.js](src/routes/tags.js), [src/controllers/tagController.js](src/controllers/tagController.js), and [src/services/tagService.js](src/services/tagService.js).

## Commands

```sh
npm install
npm test
npm run dev
npm start
npm run populate
```

- Copy [.env.example](.env.example) to `.env` before running the application. Runtime development expects a reachable MongoDB instance and `MONGODB_URI`; authentication also requires `JWT_SECRET`.
- `npm test` runs Vitest tests in `tests/**/*.test.js`. The shared setup uses `mongodb-memory-server`, runs serially, and allows up to 60 seconds for database hooks.
- `npm run populate` writes the sample dataset to the configured MongoDB database; do not run it against a database whose existing data must be preserved.

## Implementation Conventions

- Keep routes focused on HTTP method/path wiring. Keep controllers thin: read request data, call a service, and return the standard `{ success, message, data }` envelope.
- Put validation, business rules, database queries, and transformations in services. For expected client errors, throw `createAppError(message, statusCode)` from [src/utils/createAppError.js](src/utils/createAppError.js); let the global handler format the error.
- Express 5 propagates rejected async handlers to [src/middleware/errorHandler.js](src/middleware/errorHandler.js), so do not add repetitive controller `try/catch` blocks unless an operation needs special recovery.
- Protect authenticated endpoints with `authenticate` from [src/middleware/authHandler.js](src/middleware/authHandler.js). It expects `Authorization: Bearer <token>` and sets `req.user` to the user id and admin flag.
- Preserve Mongoose references, timestamps, and existing response shapes when changing models or services. Never expose user passwords; auth queries explicitly select them out of responses.
- Prefer the existing imports, service helpers, and model methods over adding a new abstraction for a single endpoint.

## Current Boundaries

- The router currently mounts auth and tag endpoints in [src/routes/index.js](src/routes/index.js). Question and answer routes are not mounted yet.
- Question and answer controllers/services contain unfinished areas. Complete one layer at a time and add focused tests before wiring new routes.
- Vote mutations and their upvote/downvote conventions live in [src/services/voteService.js](src/services/voteService.js); follow that behavior rather than duplicating vote logic.

## Validation

- For API changes, add or update focused Vitest and Supertest coverage under `tests/`, then run `npm test`.
- For database-backed changes, use the in-memory MongoDB setup where possible and avoid relying on a developer's local database state.
- Before considering a route complete, verify its unauthenticated and authenticated behavior, error status, response envelope, and populated data shape.