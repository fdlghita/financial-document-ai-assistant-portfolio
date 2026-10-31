# Financial Research AI Workspace — Frontend

React-based interface for the private financial-document research application.

## Features

- Dashboard for document and assistant activity
- AI chat with document upload and retrieval workflows
- Document registry and management
- Market overview
- Drupal integration reference page

## Local development

Requires Node.js 18+ and the FastAPI backend.

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000.

The frontend uses `http://127.0.0.1:8000` as its default backend address. For another backend, set `REACT_APP_API_BASE` in a local environment file. In a Drupal environment, the API address can be provided through `drupalSettings.bourseAiWorkspace.apiBase`.

## Checks

```bash
npm test -- --watchAll=false
npm run build
```

The checks above have **not yet been executed** as part of this documentation update.

## Privacy and deployment

**Internal-use code: do not publish or deploy externally without organizational approval.**

- Never place private API keys in `REACT_APP_*` variables: Create React App embeds these values into browser-accessible bundles.
- Keep confidential PDFs, screenshots and customer data out of public assets.
- Configure backend authentication and authorization before any non-local deployment.
- Review third-party data-source terms and organizational security policies.

See the root `PRIVACY_REVIEW.md` for the full publication checklist.
