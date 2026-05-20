import pLimit from 'p-limit';

const ytLimit = pLimit(2);

export const withYoutubeLimit = <T>(fn: () => Promise<T>) => ytLimit(fn);
