// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Get the authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (user) {
        // Insert or update user in the users table
        const { email, id } = user;
        const { error: insertError } = await supabase
          .from('users')
          .upsert({ id: id, email: email, created_at: new Date() });

        if (insertError) {
          console.error('Error inserting user:', insertError);
        }
      }

      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.redirect(new URL('/auth/error', request.url));
}
