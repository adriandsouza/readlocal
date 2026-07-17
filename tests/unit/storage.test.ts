import {
  availableProgressIndex,
  clearLocal,
  getLocal,
  setLocal,
} from '../../src/lib/storage'
it('persists and clears minimal progress', async () => {
  await setLocal('progress:test', { chunkIndex: 2 })
  expect(await getLocal('progress:test')).toEqual({ chunkIndex: 2 })
  await clearLocal()
  expect(await getLocal('progress:test')).toBeUndefined()
})
it('waits for the saved background batch before restoring', () => {
  expect(availableProgressIndex(80, 20, false)).toBeUndefined()
  expect(availableProgressIndex(80, 81, false)).toBe(80)
  expect(availableProgressIndex(80, 40, true)).toBe(39)
})
