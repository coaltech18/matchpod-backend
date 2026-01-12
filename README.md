# MatchPod Server

Node/Express + TypeScript + MongoDB (Mongoose).

Setup
1. Create `.env` in `server/` with:
```
MONGODB_URI=your_atlas_connection_string
JWT_SECRET=replace_with_strong_secret
PORT=4000
```
2. Install deps:
```
npm install
```
3. Start dev server:
```
npm run dev
```

API
- GET /api/health
- POST /api/auth/register { email, password, name? }
- POST /api/auth/login { email, password }
- GET /api/users/me (Bearer token)
- PATCH /api/users/me/preferences (Bearer token)
- GET /api/users/potential-matches?filters=<json> (Bearer token)
- POST /api/matches { otherUserId } (Bearer token)
- GET /api/matches/mine (Bearer token)
- GET /api/chats (Bearer token)
- POST /api/chats/message { toUserId, text } (Bearer token)


