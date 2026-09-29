'use client';

import { useState } from 'react';

import { ChevronsUpDown, Plus, User } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { CreateTeamAccountDialog } from '@pymekit/team-accounts/components';
import { Avatar, AvatarFallback, AvatarImage } from '@pymekit/ui/avatar';
import { Button } from '@pymekit/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@pymekit/ui/command';
import { If } from '@pymekit/ui/if';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';
import { Separator } from '@pymekit/ui/separator';
import { Trans } from '@pymekit/ui/trans';
import { cn } from '@pymekit/ui/utils';

import { usePersonalAccountData } from '../hooks/use-personal-account-data';

interface AccountSelectorProps {
  accounts: Array<{
    label: string | null;
    value: string | null;
    image?: string | null;
  }>;

  features: {
    enableTeamCreation: boolean;
  };

  userId: string;
  selectedAccount?: string;
  collapsed?: boolean;
  className?: string;
  showPersonalAccount?: boolean;

  onAccountChange: (value: string | undefined) => void;
}

const PERSONAL_ACCOUNT_SLUG = 'personal';

export function AccountSelector({
  accounts,
  selectedAccount,
  onAccountChange,
  userId,
  className,
  features = {
    enableTeamCreation: true,
  },
  collapsed = false,
  showPersonalAccount = true,
}: React.PropsWithChildren<AccountSelectorProps>) {
  const [open, setOpen] = useState<boolean>(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState<boolean>(false);
  const t = useTranslations('teams');
  const personalData = usePersonalAccountData(userId);

  const value = selectedAccount ?? PERSONAL_ACCOUNT_SLUG;

  const selected = accounts.find((account) => account.value === value);
  const pictureUrl = personalData.data?.picture_url;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              data-testid={'account-selector-trigger'}
              size={collapsed ? 'icon' : 'default'}
              variant="ghost"
              role="combobox"
              aria-expanded={open}
              className={cn(
                'dark:shadow-primary/10 group w-full min-w-0 px-1 lg:w-auto',
                {
                  'justify-start': !collapsed,
                  'm-auto justify-center lg:w-full': collapsed,
                },
                className,
              )}
            />
          }
        >
          <If
            condition={selected}
            fallback={
              <span
                className={cn('flex max-w-full items-center', {
                  'justify-center gap-x-0': collapsed,
                  'gap-x-2': !collapsed,
                })}
              >
                <PersonalAccountAvatar pictureUrl={pictureUrl} />

                <span
                  className={cn('truncate', {
                    hidden: collapsed,
                  })}
                >
                  <Trans i18nKey={'teams.personalAccount'} />
                </span>
              </span>
            }
          >
            {(account) => (
              <span
                className={cn('flex max-w-full items-center', {
                  'justify-center gap-x-0': collapsed,
                  'gap-x-2': !collapsed,
                })}
              >
                <Avatar className={'h-6 w-6'}>
                  <AvatarImage src={account.image ?? undefined} />

                  <AvatarFallback>
                    {account.label ? account.label[0] : ''}
                  </AvatarFallback>
                </Avatar>

                <span
                  className={cn('truncate lg:max-w-[130px]', {
                    hidden: collapsed,
                  })}
                >
                  {account.label}
                </span>
              </span>
            )}
          </If>

          <ChevronsUpDown
            className={cn('h-4 w-4 shrink-0 opacity-50', {
              hidden: collapsed,
            })}
          />
        </PopoverTrigger>

        <PopoverContent
          data-testid={'account-selector-content'}
          className="w-full gap-0 p-0"
        >
          <Command value={value}>
            <CommandInput placeholder={t('searchAccount')} className="h-9" />

            <CommandList>
              {showPersonalAccount && (
                <>
                  <CommandGroup>
                    <CommandItem
                      tabIndex={0}
                      value={PERSONAL_ACCOUNT_SLUG}
                      onSelect={() => onAccountChange(undefined)}
                      className={cn('', {
                        'bg-muted': value === PERSONAL_ACCOUNT_SLUG,
                        'data-selected:hover:bg-muted/50 data-selected:bg-transparent':
                          value !== PERSONAL_ACCOUNT_SLUG,
                      })}
                    >
                      <PersonalAccountAvatar />

                      <span className={'ml-2'}>
                        <Trans i18nKey={'teams.personalAccount'} />
                      </span>
                    </CommandItem>
                  </CommandGroup>

                  <CommandSeparator />
                </>
              )}

              <If condition={accounts.length > 0}>
                <CommandGroup
                  heading={
                    <Trans
                      i18nKey={'teams.yourTeams'}
                      values={{ teamsCount: accounts.length }}
                    />
                  }
                >
                  {(accounts ?? []).map((account) => (
                    <CommandItem
                      className={cn('', {
                        'bg-muted': value === account.value,
                        'data-selected:hover:bg-muted/50 data-selected:bg-transparent':
                          value !== account.value,
                      })}
                      tabIndex={0}
                      data-testid={'account-selector-team'}
                      data-name={account.label}
                      data-slug={account.value}
                      key={account.value}
                      value={account.value ?? undefined}
                      onSelect={(currentValue) => {
                        setOpen(false);

                        if (onAccountChange) {
                          onAccountChange(currentValue);
                        }
                      }}
                    >
                      <div className={'flex w-full items-center'}>
                        <Avatar className={'mr-2 h-6 w-6'}>
                          <AvatarImage src={account.image ?? undefined} />

                          <AvatarFallback
                            className={cn({
                              ['group-hover:bg-background']:
                                value !== account.value,
                            })}
                          >
                            {account.label ? account.label[0] : ''}
                          </AvatarFallback>
                        </Avatar>

                        <span className={'max-w-[165px] truncate'}>
                          {account.label}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </If>
            </CommandList>
          </Command>

          <If condition={features.enableTeamCreation}>
            <div className="px-1">
              <Separator />

              <div className="py-1">
                <Button
                  data-testid={'create-team-account-trigger'}
                  variant="ghost"
                  className="w-full justify-start text-sm font-normal"
                  onClick={() => {
                    setIsCreatingAccount(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-3 h-4 w-4" />

                  <span>
                    <Trans i18nKey={'teams.createTeam'} />
                  </span>
                </Button>
              </div>
            </div>
          </If>
        </PopoverContent>
      </Popover>

      <If condition={features.enableTeamCreation}>
        <CreateTeamAccountDialog
          isOpen={isCreatingAccount}
          setIsOpen={setIsCreatingAccount}
        />
      </If>
    </>
  );
}

function UserAvatar(props: { pictureUrl?: string }) {
  return (
    <Avatar className={'h-6 w-6 rounded-xs'}>
      <AvatarImage src={props.pictureUrl} />
    </Avatar>
  );
}

function PersonalAccountAvatar({ pictureUrl }: { pictureUrl?: string | null }) {
  return pictureUrl ? (
    <UserAvatar pictureUrl={pictureUrl} />
  ) : (
    <User className="h-5 w-5" />
  );
}
