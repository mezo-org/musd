---
inclusion: always
---

# Mezo Ecosystem Documentation Reference

This steering file provides context about the Mezo ecosystem for MUSD development.

## Mezo Documentation Repository

The official Mezo developer documentation is available at:
- **URL**: https://github.com/fapulito/documentation
- **Public Docs**: https://mezo.org/docs

## Key Information

### Technology Stack
- **Astro 5** with **Starlight** for documentation
- **Node.js** and **npm** for scripts and tooling
- **remark-math** and **rehype-katex** for math/KaTeX support
- **sharp** for image processing
- **starlight-sidebar-topics** to manage sidebar topics

### Documentation Structure
- `src/content/docs/docs/` — primary markdown content organized by topic (e.g., `users/`, `developers/`)
- `public/docs/` — static assets (images, PDFs) served as-is
- `src/assets/` — project assets referenced by the site

### Important Topics
When extending MUSD, refer to the Mezo documentation for:
- User guides and workflows
- Developer integration patterns
- Pool mechanics and rebalancing
- Simple interest calculations
- Migration procedures

### Reference Documents in This Repo
- `docs/README.md` — Overview documentation
- `docs/rebalancing.md` — Rebalancing mechanics
- `docs/simpleInterest.md` — Interest calculation details
- `docs/migration.md` — Migration procedures
- `docs/tests.md` — Testing documentation
- `docs/CHANGELOG.md` — Change history

## Development Guidelines

When working on MUSD extensions:
1. Ensure compatibility with existing Mezo ecosystem patterns
2. Follow the documentation standards from the Mezo docs repo
3. Consider user experience patterns established in the Mezo documentation
4. Reference relevant sections of the Mezo docs when implementing features
5. Maintain consistency with Mezo's technical architecture

## License
The Mezo documentation repository is licensed under GPL-3.0.
