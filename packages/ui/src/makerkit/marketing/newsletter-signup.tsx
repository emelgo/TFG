'use client';

import { useForm } from '@tanstack/react-form';
import * as z from 'zod';

import { cn } from '../../lib/utils';
import { Button } from '../../shadcn/button';
import { Input } from '../../shadcn/input';
import { Field, FieldError } from '../field';

const NewsletterFormSchema = z.object({
  email: z.email(),
});

type NewsletterFormValues = z.output<typeof NewsletterFormSchema>;

interface NewsletterSignupProps extends React.HTMLAttributes<HTMLDivElement> {
  onSignup: (data: NewsletterFormValues) => void;
  buttonText?: string;
  placeholder?: string;
}

export function NewsletterSignup({
  onSignup,
  buttonText = 'Subscribe',
  placeholder = 'Enter your email',
  className,
  ...props
}: NewsletterSignupProps) {
  const form = useForm({
    defaultValues: {
      email: '',
    },
    validators: {
      onSubmit: NewsletterFormSchema,
    },
    onSubmit: ({ value }) => {
      onSignup(value);
    },
  });

  return (
    <div className={cn('w-full max-w-sm', className)} {...props}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-y-3"
      >
        <form.Field name="email">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <Input
                  type="email"
                  placeholder={placeholder}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />

                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <Button type="submit" className="w-full">
          {buttonText}
        </Button>
      </form>
    </div>
  );
}
