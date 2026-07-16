import { clearLocal, getLocal, setLocal } from '../../src/lib/storage'
it('persists and clears minimal progress', async()=>{await setLocal('progress:test',{chunkIndex:2});expect(await getLocal('progress:test')).toEqual({chunkIndex:2});await clearLocal();expect(await getLocal('progress:test')).toBeUndefined()})
