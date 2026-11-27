<script lang="ts">
  import { AuthCard } from '@difflab/ui'
  import { authClient } from '$lib/auth-client.js'
  import type { PageData } from './$types.js'

  let { data }: { data: PageData } = $props()

  async function handleSignIn() {
    await authClient.signIn.social({ provider: 'oidc', callbackURL: '/' })
  }

  async function handleSignOut() {
    await authClient.signOut()
    window.location.reload()
  }
</script>

<AuthCard
  mode={data.mode}
  authProvider={data.authProvider}
  authenticated={data.authenticated}
  user={data.user}
  errorMessage={data.errorMessage}
  onSignIn={handleSignIn}
  onSignOut={handleSignOut}
/>
