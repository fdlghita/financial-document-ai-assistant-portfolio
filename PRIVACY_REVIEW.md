# Privacy and publication review

> **Internal project: do not redistribute or publish as an official Casablanca Stock Exchange product without explicit authorization.**

This repository contains code developed in the context of financial-document research. Before sharing source code, screenshots, demonstrations, or data, obtain the relevant organization's permission.

## Immediate controls

1. Set the **entire repository to Private** in GitHub Settings → Danger Zone → Change repository visibility.
2. Review repository access and remove collaborators who no longer need it.
3. Inspect **all Git history**, not only the current branch, for credentials, uploaded documents, internal endpoints, personal information and licensed market datasets.
4. If a secret was ever committed, **revoke and rotate it**. Deleting a file or adding a gitignore rule does not remove it from Git history.
5. Review GitHub Actions logs, releases, forks and external clones separately. Private visibility cannot retract previously downloaded copies.

## Current engineering risks requiring review

- The API has upload, document-management and AI endpoints; do not expose it to the internet without authentication, authorization, request limits and input validation.
- Local PDF uploads, chat sessions, ChromaDB data and translated output can contain confidential information.
- Optional cloud LLM configuration can transmit document content to an external provider; confirm data handling and consent first.
- External market-data integration must comply with the provider's terms.
- The Windows startup script now binds the API and local model server to **127.0.0.1** for local development; this is not a substitute for production security.
- No automated security scan or full runtime test has been completed as part of this review.

## Safe portfolio alternative

Create a separate, independently reviewed public repository using **synthetic documents and synthetic financial data**, with no copied proprietary source, confidential screenshots, institutional logos or internal configuration. Describe the engineering concepts and your role without implying official endorsement.

## Cleanup policy

Do not remove application modules or datasets until their runtime dependencies, ownership and retention requirements have been reviewed. Changes in this branch are preliminary and must be validated before merging.
