import { describe, expect, it } from 'vitest';
import {
  classifyInviteRedeemFailure,
  classifyShareRedeemFailure,
  inviteRedeemMessage,
  shareRedeemMessage,
} from './async-ui';

describe('async-ui redeem failure classification', () => {
  it('marks invite revoked/expired/locked/incomplete as terminal', () => {
    expect(classifyInviteRedeemFailure('revoked')).toBe('terminal');
    expect(classifyInviteRedeemFailure('expired')).toBe('terminal');
    expect(classifyInviteRedeemFailure('locked')).toBe('terminal');
    expect(classifyInviteRedeemFailure('incomplete')).toBe('terminal');
  });

  it('marks unknown invite redeem failures as retryable', () => {
    expect(classifyInviteRedeemFailure(undefined)).toBe('retryable');
    expect(classifyInviteRedeemFailure('unavailable')).toBe('retryable');
    expect(classifyInviteRedeemFailure('server_error')).toBe('retryable');
  });

  it('preserves invite redeem copy', () => {
    expect(inviteRedeemMessage('revoked')).toBe('This invitation was revoked.');
    expect(inviteRedeemMessage('expired')).toBe('This invitation has expired.');
    expect(inviteRedeemMessage('locked')).toBe('Contributions are closed for now.');
    expect(inviteRedeemMessage(undefined)).toBe('We could not open this invitation.');
  });

  it('marks share revoked/expired/not_found/incomplete as terminal', () => {
    expect(classifyShareRedeemFailure('revoked')).toBe('terminal');
    expect(classifyShareRedeemFailure('expired')).toBe('terminal');
    expect(classifyShareRedeemFailure('not_found')).toBe('terminal');
    expect(classifyShareRedeemFailure('incomplete')).toBe('terminal');
  });

  it('marks unavailable/unknown share redeem failures as retryable', () => {
    expect(classifyShareRedeemFailure('unavailable')).toBe('retryable');
    expect(classifyShareRedeemFailure(undefined)).toBe('retryable');
  });

  it('preserves share redeem copy', () => {
    expect(shareRedeemMessage('expired')).toBe('This private viewing link has expired.');
    expect(shareRedeemMessage('revoked')).toBe('This private viewing link was revoked.');
    expect(shareRedeemMessage('unavailable')).toBe('Private viewing is temporarily unavailable.');
    expect(shareRedeemMessage('incomplete')).toBe(
      'This private viewing link is missing or incomplete.',
    );
  });
});
