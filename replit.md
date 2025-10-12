# ContainerYard - Docker Observability Dashboard

## Overview

ContainerYard is a modern, log-first Docker container observability and debugging tool inspired by Dozzle but with enhanced visualization, search, and debugging capabilities. The application provides real-time container monitoring, live log streaming with advanced filtering, performance metrics visualization, and integrated terminal access—all optimized for developer workflows.

**Key Features:**
- Real-time container status monitoring and metrics visualization
- Live log tail with virtual scrolling for performance
- Advanced log search with regex and DSL query support
- Interactive performance timeline with CPU/memory/network sparklines
- Integrated web-based terminal for container debugging
- Keyboard-driven navigation and shortcuts
- Dark/light theme support with modern developer tool aesthetic

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and dev server with HMR support
- **Wouter** for lightweight client-side routing
- **TanStack Query** (React Query) for server state management and caching
- **TanStack Virtual** for virtualized log rendering (handles large log datasets efficiently)
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** with custom design system for styling

**Design System:**
- Dark-first design with optional light mode support
- Custom color palette optimized for log readability
- Terminal-native feel with JetBrains Mono font for logs/code
- Consistent spacing and elevation system using CSS custom properties

**State Management Strategy:**
- Server state: TanStack Query with stale-while-revalidate pattern
- WebSocket connections: Refs to maintain persistent connections for logs/stats/terminal
- UI state: React useState/useRef for component-local state
- Theme preference: localStorage with system preference detection

**Key Frontend Components:**
- `Dashboard`: Main orchestration component managing container selection and WebSocket lifecycle
- `LogTail`: Virtualized log viewer with search, filtering, and auto-scroll
- `Terminal`: xterm.js integration for interactive shell access
- `TimelineStrip`: Performance metrics visualization using Recharts
- `ContainerCard`: Container status and quick actions UI

### Backend Architecture

**Technology Stack:**
- **Express.js** REST API server
- **WebSocket** (ws library) for real-time log/stats streaming
- **TypeScript** with ES modules
- **Drizzle ORM** configured for PostgreSQL (database schema defined but provider pattern allows flexibility)

**Provider Pattern:**
The application uses a pluggable provider architecture to abstract container data sources:

- **IProvider Interface**: Defines contract for container operations (list, get, actions, logs, stats, exec)
- **MockProvider**: Static mock data for development/demo without Docker
- **SimulationProvider**: Dynamic simulation with generated logs/stats for realistic testing
- **Environment-based Selection**: `PROVIDER` env var switches between implementations

**Benefits:**
- Develop and demo anywhere without Docker daemon access
- Easy testing with predictable mock data or realistic simulations
- Future extensibility to remote Docker APIs or other container runtimes

**WebSocket Communication:**
- `/ws/logs/:containerId` - Real-time log streaming
- `/ws/stats/:containerId` - Performance metrics streaming  
- `/ws/exec/:containerId` - Interactive terminal session (bidirectional)

**API Endpoints:**
- `GET /api/containers` - List all containers with status
- `GET /api/containers/:id` - Get detailed container information
- `GET /api/containers/:id/env` - Retrieve environment variables
- `POST /api/containers/:id/action` - Perform container actions (start/stop/restart/remove)

### Data Flow Architecture

**Real-time Streaming:**
1. Client establishes WebSocket connection for selected container
2. Server streams logs/stats as they arrive from provider
3. Client buffers in-memory (logs array, stats array) with size limits
4. Virtual scrolling renders only visible log entries for performance
5. Auto-scroll follows tail unless user manually scrolls up

**Search and Filtering:**
- Client-side filtering on buffered logs for instant response
- Supports plain text, regex patterns, and custom DSL queries
- Log level detection via regex for both structured (JSON) and unstructured logs

**Container Actions:**
- REST API mutation via TanStack Query
- Optimistic updates with automatic refetch on success
- Confirmation dialogs for destructive actions (stop/remove)

### External Dependencies

**UI Component Libraries:**
- **Radix UI**: Headless accessible primitives (Dialog, Dropdown, Tabs, etc.)
- **shadcn/ui**: Pre-built styled components using Radix + Tailwind
- **xterm.js**: Terminal emulator with FitAddon and WebLinksAddon
- **Recharts**: Declarative charting library for metrics visualization
- **Lucide React**: Icon library

**Data Management:**
- **TanStack Query**: Async state management with caching
- **TanStack Virtual**: Virtual scrolling for performance
- **date-fns**: Date formatting utilities
- **Zod**: Schema validation (shared between client/server)

**Development Tools:**
- **React Hotkeys Hook**: Keyboard shortcut management
- **class-variance-authority**: Type-safe variant styles
- **clsx + tailwind-merge**: Conditional class utilities

**Database (Configured but Optional):**
- **Drizzle ORM** with PostgreSQL dialect
- **Neon Serverless**: PostgreSQL driver
- Schema defined in `shared/schema.ts` but current providers use in-memory data
- Future use cases: persistent log bookmarks, saved searches, user preferences

**Backend Runtime:**
- **Node.js** with ES modules
- **ws**: WebSocket server implementation
- **Express**: HTTP server and middleware
- **tsx**: TypeScript execution for development

### Cross-cutting Concerns

**Type Safety:**
- Shared schema definitions in `shared/schema.ts` using Zod
- Type inference from Zod schemas ensures client/server contract
- Strict TypeScript configuration with path aliases

**Performance Optimizations:**
- Virtual scrolling for logs (only renders visible rows)
- WebSocket streaming avoids HTTP polling overhead
- Debounced search filtering
- Efficient re-render control with React.memo and useCallback where needed

**Accessibility:**
- Radix UI primitives provide ARIA attributes and keyboard navigation
- Focus management in modals and dialogs
- Screen reader labels for icon-only buttons

**Error Handling:**
- WebSocket reconnection logic (to be implemented)
- API error boundaries with toast notifications
- Graceful degradation when container data unavailable