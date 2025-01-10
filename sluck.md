# Sluck - Modern Slack Clone

## Overview

Sluck is a modern, real-time communication platform built with Next.js 14+, TypeScript, and Supabase. It implements core Slack-like features while maintaining a clean, performant architecture and excellent user experience.

## Why These Technology Choices?

### Core Framework: Next.js 14+ (App Router)
- **Server Components**: Enables superior performance through server-side rendering and streaming
- **App Router**: Provides more intuitive routing with nested layouts and better code organization
- **Server Actions**: Eliminates need for separate API routes in many cases
- **Streaming**: Allows for progressive loading of complex pages
- **React 19 Ready**: Prepared for future React features and improvements

### Database & Backend: Supabase
- **PostgreSQL**: Rock-solid database with advanced features (JSONB, Full Text Search)
- **Real-time**: Native WebSocket support for instant updates
- **Row Level Security**: Built-in security at the database level
- **Storage**: Integrated file storage solution
- **Edge Functions**: Serverless compute when needed
- **Cost Effective**: Generous free tier and reasonable scaling costs

### Authentication: NextAuth.js v5
- **Google-Only Auth**: Simplifies onboarding and reduces password management
- **Type Safety**: Full TypeScript support
- **JWT Sessions**: Stateless authentication for better performance
- **Middleware Support**: Easy protection of routes and API endpoints

### UI: Tailwind CSS + shadcn/ui
- **Utility-First**: Rapid development without context switching
- **Performance**: Small bundle size through PurgeCSS
- **Customization**: Easy theming and style modifications
- **Accessibility**: Built-in best practices through shadcn/ui
- **Component Library**: High-quality, unstyled components as foundation

## Core Features

### 1. Workspaces

#### Creation & Management
- Create workspaces with unique names and optional descriptions
- Custom workspace URLs (slugs)
- Workspace settings and customization
- Invite system with temporary codes
- Workspace switching

#### Roles & Permissions
- **Owner**: Full control (one per workspace)
- **Admin**: Manage members and channels
- **Member**: Basic participation rights

#### Implementation Details
- Unique slugs for clean URLs
- Real-time member list updates
- Cached workspace data for fast switching
- Optimistic UI updates for better UX

### 2. Authentication

#### Google Sign-in
- OAuth 2.0 implementation
- Automatic profile creation
- Email verification handled by Google
- Profile picture sync

#### Session Management
- JWT-based sessions
- Automatic token refresh
- Secure cookie handling
- Cross-tab synchronization

#### Protected Routes
- Middleware-based protection
- Role-based access control
- Authentication state syncing
- Loading states during auth checks

### 3. Channels

#### Types & Creation
- Public channels visible to all
- Channel naming conventions
- Optional descriptions
- Member management

#### Features
- Real-time message updates
- Member list with roles
- Channel settings
- Message history
- Pinned messages

#### Implementation
- Optimistic UI updates
- Cached channel lists
- Real-time member presence
- Unread message tracking

### 4. Direct Messaging

#### Conversations
- One-on-one messaging
- Real-time message delivery
- Conversation history
- Online status indicators

#### Features
- Typing indicators
- Read receipts
- Message reactions
- File sharing

#### Implementation
- WebSocket connections
- Message queuing
- Offline support
- Push notifications

### 5. Real-time Messaging

#### Message Types
- Text messages
- Rich text formatting
- Code blocks
- Link previews
- Image embeds

#### Features
- Edit history
- Delete messages
- Message reactions
- Thread support
- Mentions

#### Technical Implementation
- WebSocket connections
- Message queuing
- Offline support
- Optimistic updates
- Rate limiting

### 6. UI Organization

#### Sidebar
- Workspace switcher
- Channel list
- Direct message list
- Unread indicators
- Presence indicators

#### Main Content
- Message history
- Thread view
- Member list
- Search results
- File browser

#### Implementation
- Responsive design
- Mobile-first approach
- Keyboard shortcuts
- Accessibility features

### 7. File Sharing

#### Supported Types
- Images (PNG, JPG, GIF)
- Documents (PDF, DOC)
- Code snippets
- Audio files
- Video files

#### Features
- Drag and drop upload
- Preview generation
- Progressive loading
- Download options

#### Implementation
- Supabase Storage
- Client-side compression
- Chunked uploads
- Type validation

### 8. User Presence

#### Status Types
- Online/Offline
- Away
- Do Not Disturb
- Custom status

#### Features
- Automatic updates
- Status history
- Scheduled statuses
- Status expiration

#### Implementation
- Heartbeat system
- Presence aggregation
- Status caching
- Cross-tab sync

### 9. Threading

#### Features
- Thread creation
- Inline replies
- Notification settings
- Thread summary
- Participant list

#### Implementation
- Nested data structure
- Real-time updates
- Thread collapse/expand
- Unread tracking

### 10. Reactions

#### Features
- Emoji reactions
- Reaction counts
- Recent reactions
- Custom emojis

#### Implementation
- Emoji picker
- Real-time updates
- Optimistic UI
- Rate limiting

## Database Schema

See the database schema section in the requirements for detailed table structures and relationships.

## Security Considerations

### Authentication
- JWT token rotation
- CSRF protection
- Rate limiting
- Session invalidation

### Data Access
- Row Level Security
- Input validation
- SQL injection prevention
- XSS protection

### File Upload
- Type validation
- Size limits
- Virus scanning
- Metadata stripping

## Performance Optimizations

### Client-Side
- Code splitting
- Image optimization
- Bundle size optimization
- Service Worker caching

### Server-Side
- Edge functions
- Response caching
- Database indexing
- Query optimization

### Real-time
- Message batching
- Connection pooling
- Presence optimization
- Event debouncing

## Development Practices

### Code Organization
- Feature-based structure
- Shared components
- Type safety
- Error boundaries

### Testing
- Unit tests
- Integration tests
- E2E tests
- Performance testing

### Deployment
- CI/CD pipeline
- Environment management
- Monitoring
- Error tracking

## Future Considerations

### Scalability
- Horizontal scaling
- Cache strategies
- Database sharding
- Load balancing

### Features
- Voice/Video calls
- Screen sharing
- App integrations
- Advanced search

### Monetization
- Subscription tiers
- Usage limits
- Premium features
- Enterprise options 