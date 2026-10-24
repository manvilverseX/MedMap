import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  DoctorDemoCredentials,
  getDemoDoctorCredentials,
  LOCAL_DEMO_DOCTOR_USERNAME,
  LOCAL_DEMO_DOCTOR_PASSWORD,
} from '../components/doctor/DoctorDemoCredentials';

describe('DoctorDemoCredentials component and constants', () => {
  it('provides matching local demo doctor credentials', () => {
    expect(LOCAL_DEMO_DOCTOR_USERNAME).toBe('demo_doctor');
    expect(LOCAL_DEMO_DOCTOR_PASSWORD).toBe('demo_doctor_password123');
  });

  it('returns local credentials by default in dev environment', () => {
    const creds = getDemoDoctorCredentials();
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe('demo_doctor');
    expect(creds?.password).toBe('demo_doctor_password123');
  });

  it('renders demo credentials box and quick-fill button', () => {
    const handleQuickFill = vi.fn();
    render(<DoctorDemoCredentials onQuickFill={handleQuickFill} />);

    expect(screen.getByText('Demo Login Credentials')).toBeDefined();
    expect(screen.getByText('demo_doctor')).toBeDefined();

    const quickFillBtn = screen.getByRole('button', { name: /fill demo credentials/i });
    expect(quickFillBtn).toBeDefined();

    fireEvent.click(quickFillBtn);
    expect(handleQuickFill).toHaveBeenCalledTimes(1);
    expect(handleQuickFill).toHaveBeenCalledWith({
      username: 'demo_doctor',
      password: 'demo_doctor_password123',
    });
  });
});
