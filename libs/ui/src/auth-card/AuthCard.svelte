<script lang="ts">
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Center,
    HStack,
    VStack,
  } from '@cloudvoyant/helical-svelte'
  import { cn } from '@cloudvoyant/helical-ui'
  import { authCardVariants, authErrorClass, authIdentityBoxClass } from './styles.js'
  import type { AuthCardProps } from './types.js'

  let {
    mode,
    authProvider,
    authenticated,
    user = null,
    loginHref = '/api/auth/login',
    logoutHref = '/api/auth/logout',
    onSignIn,
    onSignOut,
    errorMessage = null,
    size = 'md',
    class: className,
  }: AuthCardProps = $props()

  const displayLabel = $derived(
    user?.name || user?.email || (mode === 'local' ? 'Local workspace' : 'Signed-in user'),
  )
  const statusLabel = $derived(authenticated ? 'Signed in' : 'Signed out')
</script>

<Center class="min-h-screen bg-background px-4 py-12 text-foreground">
  <Card class={cn(authCardVariants({ size }), className)}>
    <CardHeader>
      <HStack class="items-center justify-between gap-2">
        <CardTitle>Difflab</CardTitle>
        <Badge variant={authenticated ? 'solid' : 'outline'}>
          {statusLabel}
        </Badge>
      </HStack>
      <CardDescription>
        {#if mode === 'local'}
          Running locally over loopback SQLite.
        {:else if authProvider === 'oidc'}
          Authenticate with your configured OpenID Connect provider.
        {:else}
          Token-authenticated Difflab deployment.
        {/if}
      </CardDescription>
    </CardHeader>

    <CardBody>
      <VStack class="gap-3">
        {#if errorMessage}
          <div role="alert" class={authErrorClass}>
            {errorMessage}
          </div>
        {/if}

        {#if authenticated && user}
          <div class={authIdentityBoxClass}>
            <VStack class="gap-1">
              <div class="font-medium">{displayLabel}</div>
              {#if user.email}
                <div class="text-xs text-muted-foreground">{user.email}</div>
              {/if}
              <div class="text-xs text-muted-foreground">
                Workspace: {user.workspaceId} · Auth: {user.via}
              </div>
            </VStack>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">Sign in to access your Difflab workspace.</p>
        {/if}
      </VStack>
    </CardBody>

    <CardFooter>
      <HStack class="w-full justify-end gap-2">
        {#if authProvider === 'oidc'}
          {#if authenticated}
            {#if onSignOut}
              <Button type="button" variant="outline" onclick={onSignOut}>Sign out</Button>
            {:else}
              <form method="post" action={logoutHref}>
                <Button type="submit" variant="outline">Sign out</Button>
              </form>
            {/if}
          {:else if onSignIn}
            <Button type="button" variant="solid" onclick={onSignIn}>Sign in</Button>
          {:else}
            <form method="get" action={loginHref}>
              <Button type="submit" variant="solid">Sign in</Button>
            </form>
          {/if}
        {/if}
      </HStack>
    </CardFooter>
  </Card>
</Center>
