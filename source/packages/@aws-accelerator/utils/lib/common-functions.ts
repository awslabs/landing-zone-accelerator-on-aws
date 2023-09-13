export function chunkArray<Type>(array: Type[], chunkSize: number): Type[][] {
  const chunkedArray: Type[][] = [];
  let index = 0;

  while (index < array.length) {
    chunkedArray.push(array.slice(index, index + chunkSize));
    index += chunkSize;
  }
  return chunkedArray;
}
