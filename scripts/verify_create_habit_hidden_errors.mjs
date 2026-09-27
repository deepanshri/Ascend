import { collectCreateHabitHiddenErrors } from '../src/lib/createHabitValidation.ts';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const empty = collectCreateHabitHiddenErrors({
  purposeAnchor: '',
  fallbackMicro: '',
  isKeystone: false,
  keystoneCapReached: true,
});
assert(!empty.hasError, 'empty hidden fields must stay valid');

const keystoneBlocked = collectCreateHabitHiddenErrors({
  purposeAnchor: '',
  fallbackMicro: '',
  isKeystone: true,
  keystoneCapReached: true,
});
assert(keystoneBlocked.hasError && keystoneBlocked.keystone, 'keystone at cap must fail');

const keystoneOk = collectCreateHabitHiddenErrors({
  purposeAnchor: '',
  fallbackMicro: '2 min stretch',
  isKeystone: true,
  keystoneCapReached: false,
});
assert(!keystoneOk.hasError, 'keystone under cap must pass');

const longPurpose = collectCreateHabitHiddenErrors({
  purposeAnchor: 'x'.repeat(161),
  fallbackMicro: '',
  isKeystone: false,
  keystoneCapReached: false,
});
assert(longPurpose.hasError && Boolean(longPurpose.purpose), 'long purpose must fail');

const longFallback = collectCreateHabitHiddenErrors({
  purposeAnchor: '',
  fallbackMicro: 'x'.repeat(81),
  isKeystone: false,
  keystoneCapReached: false,
});
assert(longFallback.hasError && Boolean(longFallback.fallback), 'long fallback must fail');

console.log('OK — hidden-field validation cases passed');
