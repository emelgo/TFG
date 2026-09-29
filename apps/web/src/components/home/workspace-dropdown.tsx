'use client';

import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Plus,
  Settings,
  Shield,
  User,
  Users,
} from 'lucide-react';

import { usePersonalAccountData } from '@pymekit/accounts/hooks/use-personal-account-data';
import { useSignOut } from '@pymekit/supabase/hooks/use-sign-out';
import { CreateTeamAccountDialog } from '@pymekit/team-accounts/components';
import { Avatar, AvatarFallback, AvatarImage } from '@pymekit/ui/avatar';
import { Button } from '@pymekit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { If } from '@pymekit/ui/if';
import { SubMenuModeToggle } from '@pymekit/ui/mode-toggle';
import { ProfileAvatar } from '@pymekit/ui/profile-avatar';
import { useSidebar } from '@pymekit/ui/sidebar';
import { Trans } from '@pymekit/ui/trans';

import featuresFlagConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { setActiveAccountFunction } from '#/lib/server/active-workspace.functions.ts';
import type { WorkspaceShape } from '#/lib/server/workspace-shape.ts';

/**
 * Combined account switcher + user menu for the unified app sidebar. Lists the
 * personal account plus every team the user belongs to, and switches the active
 * workspace by mutating the DB-backed pointer (`setActiveAccountFunction`) then
 * re-running every loader via `router.invalidate()` — no navigation, no slug.
 */
export function WorkspaceDropdown({
  workspace,
}: {
  workspace: WorkspaceShape;
}) {
  const router = useRouter();
  const { open: isSidebarOpen } = useSidebar();
  const signOutMutation = useSignOut();
  const setActiveAccount = useServerFn(setActiveAccountFunction);

  const { account, accounts, user } = workspace;

  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  const collapsed = !isSidebarOpen;
  const isTeamContext = !account.is_personal_account;

  // The personal account row (id === user.id) seeds the user-menu header. When
  // personal is active it is the active account; otherwise it is fetched.
  const { data: personalAccountData } = usePersonalAccountData(
    user.id,
    account.is_personal_account
      ? {
          id: account.id,
          name: account.name,
          picture_url: account.picture_url,
        }
      : undefined,
  );

  const switchAccount = useMutation({
    mutationFn: (accountId: string) =>
      setActiveAccount({ data: { accountId } }),
    onSuccess: () => router.invalidate(),
  });

  const displayName = personalAccountData?.name ?? user.email ?? '';
  const userEmail = user.email ?? '';

  const currentLabel = isTeamContext ? account.name : displayName;

  const currentAvatar = isTeamContext
    ? account.picture_url
    : (personalAccountData?.picture_url ?? null);

  const settingsPath = pathsConfig.app.settings;

  return (
    <div className="min-w-0 flex-1">
      <DropdownMenu>
        {collapsed ? (
          <div className="flex flex-col items-center justify-center">
            <DropdownMenuTrigger
              render={
                <Button
                  data-testid="workspace-dropdown-trigger"
                  variant="secondary"
                  size="icon"
                  className="border-border hover:shadow"
                >
                  <Avatar className="size-8">
                    <AvatarImage
                      className="rounded-md!"
                      src={currentAvatar ?? undefined}
                      alt={currentLabel ?? ''}
                    />
                    <AvatarFallback>
                      {isTeamContext ? (
                        (currentLabel ?? '').charAt(0).toUpperCase()
                      ) : (
                        <User className="text-secondary-foreground size-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
          </div>
        ) : (
          <DropdownMenuTrigger
            render={
              <Button
                data-testid="workspace-dropdown-trigger"
                variant="ghost"
                className="hover:bg-accent/40 active:bg-accent border-border/50! hover:border-border h-11 w-full justify-start gap-x-1 rounded-md border px-1 transition-colors hover:shadow-xs"
              >
                <span className="flex aspect-square size-8 items-center justify-center">
                  <Avatar className="size-6">
                    <AvatarImage
                      src={currentAvatar ?? undefined}
                      alt={currentLabel ?? ''}
                    />
                    <AvatarFallback>
                      {isTeamContext ? (
                        (currentLabel ?? '').charAt(0).toUpperCase()
                      ) : (
                        <User className="size-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </span>

                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="max-w-md truncate">{currentLabel}</span>
                </span>

                <ChevronsUpDown className="ml-auto size-4 transition-opacity duration-300" />
              </Button>
            }
          />
        )}

        <DropdownMenuContent
          className="min-w-60!"
          align="center"
          side={isSidebarOpen ? 'bottom' : 'inline-end'}
          sideOffset={4}
          alignOffset={8}
        >
          <div className="flex items-center justify-start gap-2 py-1.5">
            <div className="w-2/12">
              <ProfileAvatar
                className="size-6"
                displayName={displayName}
                pictureUrl={personalAccountData?.picture_url}
              />
            </div>

            <div className="flex w-10/12 flex-col text-left text-sm">
              <span
                className="max-w-max truncate font-medium"
                data-testid="account-dropdown-display-name"
              >
                {displayName}
              </span>

              <span className="text-muted-foreground max-w-max truncate text-xs">
                {userEmail}
              </span>
            </div>
          </div>

          <DropdownMenuSeparator />

          <If condition={featuresFlagConfig.enableTeamAccounts}>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="workspace-switch-submenu">
                <Users className="size-4" />
                <span>
                  <Trans i18nKey={'teams.switchWorkspace'} />
                </span>
              </DropdownMenuSubTrigger>

              <DropdownMenuSubContent
                className="max-h-[50vh] overflow-y-auto"
                data-testid="workspace-switch-content"
              >
                <If condition={!featuresFlagConfig.enableTeamsOnly}>
                  <DropdownMenuItem
                    data-testid="personal-workspace-item"
                    className="flex gap-2"
                    onClick={() => switchAccount.mutate(user.id)}
                  >
                    <div className="flex size-8 items-center justify-center rounded-sm border">
                      <User className="size-4" />
                    </div>

                    <span className="flex-1">
                      <Trans i18nKey={'teams.personalAccount'} />
                    </span>

                    {!isTeamContext && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                </If>

                {accounts.length > 0 && (
                  <>
                    <If condition={!featuresFlagConfig.enableTeamsOnly}>
                      <DropdownMenuSeparator />
                    </If>

                    {accounts.map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        data-testid="workspace-team-item"
                        data-name={item.name}
                        data-slug={item.slug}
                        className="flex gap-2"
                        onClick={() => {
                          if (item.id && item.id !== account.id) {
                            switchAccount.mutate(item.id);
                          }
                        }}
                      >
                        <Avatar className="size-8">
                          <AvatarImage
                            className="rounded-md!"
                            src={item.picture_url ?? undefined}
                            alt={item.name ?? ''}
                          />
                          <AvatarFallback className="rounded-md! text-xs">
                            {(item.name ?? '').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                        </div>

                        {account.id === item.id && (
                          <Check className="ml-auto size-4" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

                <If condition={featuresFlagConfig.enableTeamCreation}>
                  <DropdownMenuItem
                    onClick={() => setIsCreatingTeam(true)}
                    data-testid="create-team-trigger"
                    className="bg-background/50 sticky bottom-0 mt-1 flex h-10 w-full gap-2 border backdrop-blur-lg"
                  >
                    <Plus className="size-4" />

                    <span>
                      <Trans i18nKey={'teams.createTeam'} />
                    </span>
                  </DropdownMenuItem>
                </If>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
          </If>

          <DropdownMenuItem
            render={
              <Link
                className="flex items-center gap-x-2"
                to={settingsPath}
                data-testid="workspace-settings-link"
              >
                <Settings className="size-4" />

                <span>
                  <Trans i18nKey={'common.routes.settings'} />
                </span>
              </Link>
            }
          />

          <If condition={user.is_superadmin}>
            <DropdownMenuItem
              render={
                <a
                  className="flex items-center gap-x-2 text-yellow-700 hover:text-yellow-600 dark:text-yellow-500"
                  href="/admin"
                  data-testid="workspace-admin-link"
                >
                  <Shield className="size-4" />

                  <span>Super Admin</span>
                </a>
              }
            />
          </If>

          <DropdownMenuSeparator />

          <If condition={featuresFlagConfig.enableThemeToggle}>
            <SubMenuModeToggle />

            <DropdownMenuSeparator />
          </If>

          <DropdownMenuItem
            disabled={signOutMutation.isPending}
            className="flex items-center gap-x-2"
            data-testid="workspace-sign-out"
            onClick={() => signOutMutation.mutate()}
          >
            <LogOut className="size-4" />

            <span>
              <Trans i18nKey={'auth.signOut'} />
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <If condition={featuresFlagConfig.enableTeamCreation}>
        <CreateTeamAccountDialog
          isOpen={isCreatingTeam}
          setIsOpen={setIsCreatingTeam}
        />
      </If>
    </div>
  );
}
