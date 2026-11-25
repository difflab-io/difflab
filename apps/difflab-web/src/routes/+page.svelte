<script lang="ts">
  import { AuthCard } from '@difflab/ui'
  import type { PageData } from './$types.js'

  let { data }: { data: PageData } = $props()
</script>

<AuthCard
  mode={data.mode}
  authProvider={data.authProvider}
  authenticated={data.authenticated}
  user={data.user}
  errorMessage={data.errorMessage}
/>
