# Authentication in this Application

This application uses [Supabase](https://supabase.com) for authentication, specifically implementing Google OAuth using the new `@supabase/ssr` package for Next.js App Router. Here's how it works:

## Setup and Dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
```

## Authentication Flow

1. **Initial Request**: When a user visits any page, the middleware checks if they're authenticated
2. **Unauthenticated Users**: Redirected to `/auth`
3. **Google Sign In**: User clicks sign in button, redirected to Google
4. **Callback**: After Google auth, redirected back to our app
5. **Session Creation**: Exchange OAuth code for Supabase session
6. **Profile Creation**: Automatically create user profile with Google data
7. **Protected Access**: User can now access protected routes

## Key Components

### 1. Supabase Clients

We have two types of Supabase clients:

**Client-side (Browser) Client**:
```typescript
// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Server-side Client**:
```typescript
// utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle cookie setting error
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle cookie removal error
          }
        },
      },
    }
  )
}
```

### 2. Middleware Protection

The middleware protects all routes and handles session refresh:

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req: request, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // If no session and trying to access protected route, redirect to auth page
  if (!session && request.nextUrl.pathname !== '/auth') {
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### 3. Auth Page

The auth page handles the Google sign-in initiation:

```typescript
// app/auth/page.tsx
'use client'

import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'

export default function AuthPage() {
  const supabase = createClient()

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      console.error('Error:', error.message)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Button onClick={handleSignIn}>
        Sign in with Google
      </Button>
    </div>
  )
}
```

### 4. Auth Callback

Handles the OAuth callback and session creation:

```typescript
// app/auth/callback/route.ts
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Return to auth page if something went wrong
  return NextResponse.redirect(new URL('/auth', request.url))
}
```

### 5. Protected Pages

Example of a protected page using server-side auth check:

```typescript
// app/page.tsx
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/auth')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div>
      <h1>Welcome, {profile.name}</h1>
      <img src={profile.avatar_url} alt="Profile" />
    </div>
  )
}
```

## Database Setup

The application automatically creates user profiles in a `profiles` table when users sign up. This is handled by a PostgreSQL trigger that fires when new users are created in `auth.users`:

```sql
-- Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email,
    full_name,
    avatar_url,
    created_at,
    display_name
  )
  VALUES (
    NEW.id,
    NEW.email,
    (NEW.raw_user_meta_data->>'full_name')::text,
    (NEW.raw_user_meta_data->>'avatar_url')::text,
    NEW.created_at,
    (NEW.raw_user_meta_data->>'full_name')::text  -- Default display_name to full_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Security Considerations

1. **Server-Side Validation**: Always use `getUser()` instead of `getSession()` for auth checks in server code
2. **Middleware Protection**: All non-public routes are automatically protected
3. **Cookie Management**: Session cookies are handled securely by Supabase
4. **OAuth Security**: Uses PKCE flow for secure OAuth authentication
5. **Database Security**: Profiles table protected by Row Level Security

## Environment Variables

Required environment variables in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Google OAuth Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Configure OAuth consent screen
3. Create OAuth 2.0 credentials
4. Add authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
5. Add client ID and secret to Supabase dashboard 