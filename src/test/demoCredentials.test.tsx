import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import {
  DoctorDemoCredentials,
  getDemoDoctorCredentials,
  DEFAULT_DEMO_DOCTOR_USERNAME,
  DEFAULT_DEMO_DOCTOR_PASSWORD,
  LOCAL_DEMO_DOCTOR_USERNAME,
  LOCAL_DEMO_DOCTOR_PASSWORD,
} from '../components/doctor/DoctorDemoCredentials';
import { DoctorLoginPage } from '../pages/doctor/DoctorLoginPage';
import { LandingPage } from '../pages/LandingPage';

describe('DoctorDemoCredentials component and constants', () => {
  it('provides matching test doctor credentials (doctor / doctor)', () => {
    expect(DEFAULT_DEMO_DOCTOR_USERNAME).toBe('doctor');
    expect(DEFAULT_DEMO_DOCTOR_PASSWORD).toBe('doctor');
    expect(LOCAL_DEMO_DOCTOR_USERNAME).toBe('doctor');
    expect(LOCAL_DEMO_DOCTOR_PASSWORD).toBe('doctor');
  });

  it('returns test doctor credentials in development and production environments by default', () => {
    const creds = getDemoDoctorCredentials();
    expect(creds).not.toBeNull();
    expect(creds.username).toBe('doctor');
    expect(creds.password).toBe('doctor');
  });

  it('renders test doctor account card and autofill button in DoctorDemoCredentials', () => {
    const handleQuickFill = vi.fn();
    render(<DoctorDemoCredentials onQuickFill={handleQuickFill} />);

    expect(screen.getByTestId('doctor-demo-credentials-card')).toBeDefined();
    expect(screen.getByText('Test doctor account')).toBeDefined();
    expect(screen.getAllByText('doctor').length).toBeGreaterThanOrEqual(2);

    const autofillBtn = screen.getByTestId('doctor-autofill-btn');
    expect(autofillBtn).toBeDefined();
    expect(autofillBtn.textContent).toContain('Autofill credentials');

    fireEvent.click(autofillBtn);
    expect(handleQuickFill).toHaveBeenCalledTimes(1);
    expect(handleQuickFill).toHaveBeenCalledWith({
      username: 'doctor',
      password: 'doctor',
    });
  });

  it('renders doctor login page with demo card, autofill fills inputs, Sign in stays enabled, and form is not auto-submitted', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(
      <MemoryRouter>
        <DoctorLoginPage />
      </MemoryRouter>
    );

    // 1. Demo card is rendered
    expect(screen.getByTestId('doctor-demo-credentials-card')).toBeDefined();

    // 2. Inputs start empty
    const usernameInput = screen.getByRole('textbox', { name: /^username$/i }) as HTMLInputElement;
    const passwordInput = document.getElementById('doctor-password') as HTMLInputElement;
    expect(usernameInput.value).toBe('');
    expect(passwordInput.value).toBe('');

    // 3. Click autofill button
    const autofillBtn = screen.getByTestId('doctor-autofill-btn');
    fireEvent.click(autofillBtn);

    // 4. Controlled React state is filled
    expect(usernameInput.value).toBe('doctor');
    expect(passwordInput.value).toBe('doctor');

    // 5. Sign in (Login) button stays enabled
    const submitBtn = screen.getByRole('button', { name: /login/i }) as HTMLButtonElement;
    expect(submitBtn).toBeDefined();
    expect(submitBtn.disabled).toBe(false);

    // 6. Form was not auto-submitted
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('LandingPage problem statement badge and under development removal', () => {
  it('renders official problem statement badge in top-left with SIH26047 and Ministry of Ayush', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const badge = screen.getByTestId('problem-statement-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('Smart India Hackathon 2026');
    expect(badge.textContent).toContain('SIH26047');
    expect(badge.textContent).toContain('Patient Case-Taking Software');
    expect(badge.textContent).toContain('Ministry of Ayush');

    // Asserts under development is NOT rendered
    expect(screen.queryByText(/under development/i)).toBeNull();
  });
});
