<script lang="ts">
  // One volunteer, as shown on the home page and the skills page. The bio and
  // the skill list are both capped so every card in a row ends up close to the
  // same height. The full detail is on the volunteer's own page.
  interface Volunteer {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    skills: string[];
    joinDate: string | null;
  }

  export let volunteer: Volunteer;
  export let badgeLimit = 4;
</script>

<a
  href="/team/{volunteer.id}"
  aria-label={`View profile: ${volunteer.displayName}`}
  class="card-link p-5 h-full"
>
  <div class="flex items-center gap-3">
    {#if volunteer.avatarUrl}
      <img src={volunteer.avatarUrl} alt="" loading="lazy" class="h-14 w-14 shrink-0 rounded-full object-cover" />
    {:else}
      <div class="h-14 w-14 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold">
        {volunteer.displayName.slice(0, 2).toUpperCase()}
      </div>
    {/if}
    <div class="min-w-0">
      <p class="font-semibold text-brand-700 truncate">{volunteer.displayName}</p>
      {#if volunteer.joinDate}
        <p class="text-xs text-slate-500">Joined {new Date(volunteer.joinDate).getFullYear()}</p>
      {/if}
    </div>
  </div>

  {#if volunteer.bio}
    <p class="mt-3 text-sm text-slate-700 line-clamp-2">{volunteer.bio}</p>
  {/if}

  {#if volunteer.skills.length > 0}
    <div class="mt-3 flex flex-wrap gap-1">
      {#each volunteer.skills.slice(0, badgeLimit) as s}
        <span class="badge bg-slate-100 text-slate-700">{s}</span>
      {/each}
      {#if volunteer.skills.length > badgeLimit}
        <span class="badge bg-slate-100 text-slate-500">+{volunteer.skills.length - badgeLimit} more</span>
      {/if}
    </div>
  {/if}
</a>
