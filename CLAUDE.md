# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- **Build**: `npm run build` - Uses tsup to build both CommonJS and ESM formats
- **Test**: `npm test` - Runs tests with Vitest
- **Type Check**: `npm run typecheck` - Runs TypeScript compiler without emitting files
- **Development CLI**: `npm run dev` - Runs CLI directly with tsx for development
- **Single Test**: `vitest run <test-file>` - Run a specific test file

## Architecture Overview

This is a dual-purpose tool: CLI and Node.js library for converting Notion databases to markdown/HTML.

### Core Components

- **Client** (`src/client.ts`): Main API class that orchestrates the entire conversion process
  - Manages Notion API connection with caching layer
  - Handles database queries with filtering (Published=true, Date<=now)
  - Coordinates markdown/HTML generation pipeline

- **Caching System** (`src/notion/cache.ts`): File-system based cache to reduce Notion API calls
  - CacheClient wraps the raw Notion client
  - Automatically caches database and page responses
  - Supports cache purging by ID

- **Content Pipeline**:
  1. Notion blocks → Markdown (via notion-to-md with custom transformers)
  2. Markdown transformations (`src/md2md.ts`) - post-processing, image handling
  3. Markdown → HTML (`src/md2html.ts`) - unified processor with rehype plugins

- **CLI** (`src/cli.ts`): Command-line interface that uses the Client library
  - Outputs meta.json with database/post metadata
  - Downloads and optimizes images to specified directory
  - Supports multiple output formats (md, html, or both)

### Key Data Flow

1. Client queries Notion database for published posts
2. For each post: fetch blocks → convert to markdown → apply transformers → generate HTML
3. Images are collected during transformation and downloaded separately
4. CLI saves files and metadata to output directory

### Image Handling

Images are collected during markdown transformation and stored in a Map. The download process (`src/download.ts`) handles:
- Concurrent downloads with retry logic
- WebP optimization via Sharp
- Overwrite control for existing files

### Testing

Uses Vitest for testing. Test files follow `*.test.ts` pattern and are co-located with source files.

### Development Guidelines

- When updating CLI or Client options, always update the README with the corresponding changes.
