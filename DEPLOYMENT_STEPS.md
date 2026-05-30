# Deployment Steps for AI Harness API

## IMPORTANT: Run Database Migration First

Before deploying to the VPS, you MUST run the database migration in Supabase:

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your AlwaysSunny project
3. Navigate to SQL Editor
4. Copy and paste the contents of `backend/migrations/create_api_keys_table.sql`
5. Click "Run" to execute the migration
6. Verify the `api_keys` table was created successfully

## Then Deploy to VPS

Once the database migration is complete, deploy:

```bash
ssh root@76.13.191.149 "cd /opt/alwayssunny && git pull origin main && docker compose down && docker compose up -d --build"
```

## After Deployment

1. Test the API endpoints:
   ```bash
   # Check health
   curl http://76.13.191.149:8000/
   
   # Check API docs
   open http://76.13.191.149:8000/docs
   ```

2. Create a test API key (requires JWT token from frontend):
   ```bash
   curl -X POST http://76.13.191.149:8000/api/api-keys \
     -H "Authorization: Bearer <your_jwt_token>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Test Key"}'
   ```

3. Test AI context endpoint with the API key:
   ```bash
   curl http://76.13.191.149:8000/api/ai/context \
     -H "Authorization: Bearer as_<your_key>"
   ```

## Version Tagging

After successful deployment, create a version tag:

```bash
cd /Users/mike/Documents/AlwaysSunny
git tag v1.4.0 -m "v1.4.0 — AI Harness API with API Key Authentication"
git push origin v1.4.0
gh release create v1.4.0 --title "v1.4.0 — AI Harness API" --notes "
## New Features
- API key authentication system with bcrypt hashing
- AI-optimized endpoints for external AI harness integration
- Flexible authentication supporting both JWT and API keys
- Comprehensive API documentation

## Endpoints Added
- GET /api/ai/context - Aggregated system context
- POST /api/ai/command - Unified control interface
- GET /api/ai/sessions - Enhanced session queries
- POST /api/ai/recommendation - Submit AI recommendations
- POST /api/api-keys - Create API keys
- GET /api/api-keys - List API keys
- DELETE /api/api-keys/{id} - Revoke API keys

## Database Changes
- New api_keys table with RLS policies

## Documentation
- AI_HARNESS_API.md with usage examples
"
```

## Rollback Plan

If issues occur after deployment:

```bash
# Rollback to previous version
ssh root@76.13.191.149 "cd /opt/alwayssunny && git checkout d35e1f5 && docker compose down && docker compose up -d --build"

# Or drop the api_keys table if needed
# Run in Supabase SQL Editor:
# DROP TABLE IF EXISTS api_keys CASCADE;
```
