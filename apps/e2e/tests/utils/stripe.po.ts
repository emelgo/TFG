import { Page, expect } from '@playwright/test';

export class StripePageObject {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getStripeCheckoutIframe() {
    return this.page.frameLocator('[name="embedded-checkout"]');
  }

  async waitForForm() {
    return expect(async () => {
      await expect(this.billingCountry()).toBeVisible();
    }).toPass();
  }

  async fillForm(
    params: {
      billingName?: string;
      cardNumber?: string;
      expiry?: string;
      cvc?: string;
      billingCountry?: string;
    } = {},
  ) {
    const billingName = this.billingName();
    const cardNumber = this.cardNumber();
    const expiry = this.expiry();
    const cvc = this.cvc();
    const billingCountry = this.billingCountry();

    await billingName.fill(params.billingName ?? 'Mr Makerkit');
    await cardNumber.fill(params.cardNumber ?? '4242424242424242');
    await expiry.fill(params.expiry ?? '1228');
    await cvc.fill(params.cvc ?? '123');
    await billingCountry.selectOption(params.billingCountry ?? 'IT');
  }

  submitButton() {
    return this.getStripeCheckoutIframe().locator(
      '[data-testid="hosted-payment-submit-button"]',
    );
  }

  async submitForm() {
    const submitButton = this.submitButton();

    // Stripe re-renders the embedded checkout while it validates the form, and
    // a click landing mid-render is dropped silently: the button stays in its
    // "complete" state, no confirmation request is ever sent, and the test only
    // finds out 20s later when the success page never appears. Keep clicking
    // until Stripe tells us it started processing the payment.
    await expect(async () => {
      if (await submitButton.isEnabled()) {
        await submitButton.click({ timeout: 5_000 });
      }

      await expect(submitButton).toHaveClass(/SubmitButton--processing/, {
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });
  }

  cardNumber() {
    return this.getStripeCheckoutIframe().locator('#cardNumber');
  }

  cvc() {
    return this.getStripeCheckoutIframe().locator('#cardCvc');
  }

  expiry() {
    return this.getStripeCheckoutIframe().locator('#cardExpiry');
  }

  billingName() {
    return this.getStripeCheckoutIframe().locator('#billingName');
  }

  billingCountry() {
    return this.getStripeCheckoutIframe().locator('#billingCountry');
  }
}
