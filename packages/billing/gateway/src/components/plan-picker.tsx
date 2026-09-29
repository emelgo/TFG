'use client';

import { useMemo } from 'react';

import { useForm } from '@tanstack/react-form';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import {
  type BillingConfig,
  type LineItemSchema,
  getPlanIntervals,
  getPrimaryLineItem,
  getProductPlanPair,
} from '@pymekit/billing';
import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import {
  RadioGroup,
  RadioGroupItem,
  RadioGroupItemLabel,
} from '@pymekit/ui/radio-group';
import { Trans } from '@pymekit/ui/trans';
import { cn } from '@pymekit/ui/utils';

import { LineItemDetails } from './line-item-details';
import { PlanCostDisplay } from './plan-cost-display';

export function PlanPicker(
  props: React.PropsWithChildren<{
    config: BillingConfig;
    onSubmit: (data: { planId: string; productId: string }) => void;
    canStartTrial?: boolean;
    pending?: boolean;
    value?: {
      interval: string;
      planId: string;
      productId: string;
    };
  }>,
) {
  const t = useTranslations('billing');

  const intervals = useMemo(
    () => getPlanIntervals(props.config),
    [props.config],
  ) as string[];

  const PlanSchema = z
    .object({
      planId: z.string(),
      productId: z.string(),
      interval: z.string().optional(),
    })
    .refine(
      (data) => {
        try {
          const { product, plan } = getProductPlanPair(
            props.config,
            data.planId,
          );

          return product && plan;
        } catch {
          return false;
        }
      },
      { message: t('noPlanChosen'), path: ['planId'] },
    );

  const form = useForm({
    defaultValues: {
      interval: props.value?.interval ?? intervals[0],
      planId: props.value?.planId ?? '',
      productId: props.value?.productId ?? '',
    } as z.input<typeof PlanSchema>,
    validators: {
      onChange: PlanSchema,
      onSubmit: PlanSchema,
    },
    onSubmit: ({ value }) => {
      props.onSubmit(value);
    },
  });

  // Always filter out hidden products
  const visibleProducts = props.config.products.filter(
    (product) => !product.hidden,
  );

  return (
    <div className={'flex flex-col gap-y-4 lg:flex-row lg:gap-x-4 lg:gap-y-0'}>
      <form
        className={'flex w-full flex-col gap-y-4'}
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Subscribe
          selector={(state) => ({
            selectedInterval: state.values.interval,
            planId: state.values.planId,
            isValid: state.isValid,
          })}
        >
          {({ selectedInterval, planId, isValid }) => {
            const { plan: selectedPlan, product: selectedProduct } = (() => {
              try {
                return getProductPlanPair(props.config, planId);
              } catch {
                return {
                  plan: null,
                  product: null,
                };
              }
            })();

            // display the period picker if the selected plan is recurring or if no plan is selected
            const isRecurringPlan =
              selectedPlan?.paymentType === 'recurring' || !selectedPlan;

            return (
              <>
                <If condition={intervals.length}>
                  <div
                    className={cn('transition-all', {
                      ['pointer-events-none opacity-50']: !isRecurringPlan,
                    })}
                  >
                    <form.Field name={'interval'}>
                      {(field) => {
                        return (
                          <Field className={'flex flex-col gap-4'}>
                            <RadioGroup
                              name={field.name}
                              value={field.state.value}
                            >
                              <div className={'flex space-x-1'}>
                                {intervals.map((interval) => {
                                  const selected =
                                    field.state.value === interval;

                                  return (
                                    <label
                                      htmlFor={interval}
                                      key={interval}
                                      onClick={() => {
                                        form.setFieldValue(
                                          'interval',
                                          interval,
                                        );

                                        if (selectedProduct) {
                                          const plan =
                                            selectedProduct.plans.find(
                                              (item) =>
                                                item.interval === interval,
                                            );

                                          form.setFieldValue(
                                            'planId',
                                            plan?.id ?? '',
                                          );
                                        }
                                      }}
                                      className={cn(
                                        'focus-within:border-primary flex items-center gap-x-2.5 rounded-md px-2.5 py-2 transition-colors',
                                        {
                                          ['bg-muted']: selected,
                                          ['hover:bg-muted/50']: !selected,
                                        },
                                      )}
                                    >
                                      <RadioGroupItem
                                        id={interval}
                                        value={interval}
                                      />

                                      <span
                                        className={cn('text-sm', {
                                          ['cursor-pointer']: !selected,
                                        })}
                                      >
                                        <Trans
                                          i18nKey={`billing.billingInterval.${interval}`}
                                        />
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </RadioGroup>

                            <FieldError errors={field.state.meta.errors} />
                          </Field>
                        );
                      }}
                    </form.Field>
                  </div>
                </If>

                <form.Field name={'planId'}>
                  {(field) => (
                    <Field className={'flex flex-col gap-4'}>
                      <RadioGroup
                        value={field.state.value}
                        name={field.name}
                        className="gap-y-0.5"
                      >
                        {visibleProducts.map((product) => {
                          const plan = product.plans.find((item) => {
                            if (item.paymentType === 'one-time') {
                              return true;
                            }

                            return item.interval === selectedInterval;
                          });

                          if (!plan || plan.custom) {
                            return null;
                          }

                          const planId = plan.id;
                          const selected = field.state.value === planId;

                          const primaryLineItem = getPrimaryLineItem(
                            props.config,
                            planId,
                          );

                          if (!primaryLineItem) {
                            throw new Error(`Base line item was not found`);
                          }

                          return (
                            <RadioGroupItemLabel
                              selected={selected}
                              key={primaryLineItem.id}
                              htmlFor={primaryLineItem.id}
                              className="rounded-md !border-transparent"
                              onClick={() => {
                                if (selected) {
                                  return;
                                }

                                form.setFieldValue('planId', planId);

                                form.setFieldValue('productId', product.id);
                              }}
                            >
                              <div
                                className={
                                  'flex w-full flex-col content-center gap-y-3 lg:flex-row lg:items-center lg:justify-between lg:space-y-0'
                                }
                              >
                                <div
                                  className={
                                    'flex flex-col justify-center space-y-2.5'
                                  }
                                >
                                  <div
                                    className={'flex items-center space-x-2.5'}
                                  >
                                    <RadioGroupItem
                                      data-test-plan={plan.id}
                                      key={plan.id + selected}
                                      id={plan.id}
                                      value={plan.id}
                                    />

                                    <span className="font-semibold">
                                      <Trans
                                        i18nKey={`billing.plans.${product.id}.name`}
                                        defaults={product.name}
                                      />
                                    </span>

                                    <If
                                      condition={
                                        plan.trialDays && props.canStartTrial
                                      }
                                    >
                                      <div>
                                        <Badge
                                          className={cn(
                                            'px-1 py-0.5 text-xs',
                                            badgeExtras.success,
                                          )}
                                        >
                                          <Trans
                                            i18nKey={`billing.trialPeriod`}
                                            values={{
                                              period: plan.trialDays,
                                            }}
                                          />
                                        </Badge>
                                      </div>
                                    </If>
                                  </div>

                                  <span className={'text-muted-foreground'}>
                                    <Trans
                                      i18nKey={`billing.plans.${product.id}.description`}
                                      defaults={product.description}
                                    />
                                  </span>
                                </div>

                                <div
                                  className={
                                    'flex flex-col gap-y-3 lg:flex-row lg:items-center lg:space-y-0 lg:space-x-4 lg:text-right'
                                  }
                                >
                                  <div>
                                    <Price key={plan.id}>
                                      <PlanCostDisplay
                                        primaryLineItem={primaryLineItem}
                                        currencyCode={product.currency}
                                        interval={selectedInterval}
                                        alwaysDisplayMonthlyPrice={true}
                                      />
                                    </Price>

                                    <div>
                                      <span className={'text-muted-foreground'}>
                                        <If
                                          condition={
                                            plan.paymentType === 'recurring'
                                          }
                                          fallback={
                                            <Trans
                                              i18nKey={`billing.lifetime`}
                                            />
                                          }
                                        >
                                          <Trans i18nKey={`billing.perMonth`} />
                                        </If>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </RadioGroupItemLabel>
                          );
                        })}
                      </RadioGroup>

                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>

                {selectedPlan && selectedInterval && selectedProduct ? (
                  <PlanDetails
                    selectedInterval={selectedInterval}
                    selectedPlan={selectedPlan}
                    selectedProduct={selectedProduct}
                  />
                ) : null}

                <div>
                  <Button
                    type="submit"
                    data-testid="checkout-submit-button"
                    disabled={props.pending ?? !isValid}
                  >
                    {props.pending ? (
                      t('redirectingToPayment')
                    ) : (
                      <>
                        <If
                          condition={
                            selectedPlan?.trialDays && props.canStartTrial
                          }
                          fallback={t(`proceedToPayment`)}
                        >
                          <span>{t(`startTrial`)}</span>
                        </If>

                        <ArrowRight className={'ml-2 h-4 w-4'} />
                      </>
                    )}
                  </Button>
                </div>
              </>
            );
          }}
        </form.Subscribe>
      </form>
    </div>
  );
}

function PlanDetails({
  selectedProduct,
  selectedInterval,
  selectedPlan,
}: {
  selectedProduct: {
    id: string;
    name: string;
    description: string;
    currency: string;
    features: string[];
  };

  selectedInterval: string;

  selectedPlan: {
    lineItems: z.output<typeof LineItemSchema>[];
    paymentType: string;
  };
}) {
  const isRecurring = selectedPlan.paymentType === 'recurring';

  // trick to force animation on re-render
  // eslint-disable-next-line react-hooks/purity
  const key = Math.random();

  return (
    <div
      key={key}
      className={
        'fade-in animate-in flex w-full flex-col space-y-2 rounded-md border p-4'
      }
    >
      <div className={'flex flex-col space-y-1'}>
        <span className={'text-sm font-semibold'}>
          <Trans
            i18nKey={selectedProduct.name}
            defaults={selectedProduct.name}
          />
        </span>
      </div>

      <If condition={selectedPlan.lineItems.length > 0}>
        <div className={'flex flex-col space-y-1'}>
          <div className={'flex flex-col space-y-2'}>
            <LineItemDetails
              lineItems={selectedPlan.lineItems ?? []}
              selectedInterval={isRecurring ? selectedInterval : undefined}
              currency={selectedProduct.currency}
            />

            <div className={'flex flex-wrap gap-1'}>
              {selectedProduct.features.map((item) => {
                return (
                  <Badge
                    key={item}
                    className={'flex items-center gap-x-2'}
                    variant={'outline'}
                  >
                    <CheckCircle className={'h-3 w-3 text-green-500'} />

                    <span className={'text-muted-foreground'}>
                      <Trans i18nKey={item} defaults={item} />
                    </span>
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>
      </If>
    </div>
  );
}

function Price(props: React.PropsWithChildren) {
  return (
    <span className={'animate-in fade-in text-xl font-medium tracking-tight'}>
      {props.children}
    </span>
  );
}
