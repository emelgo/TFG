import { Page } from '@playwright/test';

import { BillingPageObject } from '../utils/billing.po';

export class UserBillingPageObject {
  public readonly billing: BillingPageObject;

  constructor(page: Page) {
    this.billing = new BillingPageObject(page);
  }
}
