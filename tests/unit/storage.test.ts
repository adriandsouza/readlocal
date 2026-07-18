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
it('clamps saved progress to the available document', () => {
  expect(availableProgressIndex(80, 81)).toBe(80)
  expect(availableProgressIndex(80, 40)).toBe(39)
})
