import { useInertiaForm } from '@dudousxd/nestjs-inertia-client/react-form';
import { type LoginBody, LoginBodySchema } from '../../.nestjs-inertia/forms.js';

// biome-ignore lint/complexity/noBannedTypes: codegen-emitted page props pattern
export type ComponentProps = {};

export default function Login() {
  const {
    register,
    submit,
    formState: { errors },
    isSubmitting,
    formError,
  } = useInertiaForm<LoginBody>({
    schema: LoginBodySchema,
    action: { method: 'post', url: '/auth/login' },
    defaultValues: { email: '', password: '' },
  });

  return (
    <main>
      <h1>Log in</h1>
      {formError && <p role="alert">{formError}</p>}
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" {...register('email')} />
        </label>
        {errors.email && <span>{errors.email.message}</span>}

        <label>
          Password
          <input type="password" {...register('password')} />
        </label>
        {errors.password && <span>{errors.password.message}</span>}

        <button type="submit" disabled={isSubmitting}>
          Log in
        </button>
      </form>
    </main>
  );
}
