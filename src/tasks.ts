import { Either, isLeft } from "fp-ts/lib/Either";
import { Task } from "fp-ts/lib/Task";
import { Millisecond } from "./units";

export type TransientError = "transient";
export const TransientError: TransientError = "transient";

export type MaxRetries = "max-retries";
export const MaxRetries: MaxRetries = "max-retries";

/**
 * A Task that can be retried when it fails with a transient error
 */
export type RetriableTask<E, T> = E extends TransientError
  ? never
  : Task<Either<E | TransientError, T>>;

/**
 * Wraps a RetriableTask with a number of retries
 */
export function withRetries<E, T>(
  maxRetries: number,
  backoff: (count: number) => Millisecond,
  task: RetriableTask<E, T>
): Task<Either<E | MaxRetries, T>> {
  const runTaskOnce = (
    count: number,
    currentTask: RetriableTask<E, T>
  ): Task<Either<E | MaxRetries, T>> => {
    // on first execution, count === 0
    if (count >= maxRetries - 1) {
      // no more retries left
      return currentTask.map(e =>
        // if the task fails with a TransientError, we map the error to
        // a MaxRetries error
        e.mapLeft(l => (l === TransientError ? MaxRetries : l))
      );
    }
    return currentTask.chain(r => {
      if (isLeft(r) && r.value === TransientError) {
        // when task fails with a transient error, chain it with a backoff delay
        // an then with another iteration
        const delay = delayTask(backoff(count), true);
        return delay.chain(() => runTaskOnce(count + 1, currentTask));
      }
      // the Task either failed with MaxRetries or succeeded
      return currentTask as Task<Either<E | MaxRetries, T>>;
    });
  };

  return runTaskOnce(0, task);
}

/**
 * Returns a Task that resolves to a value after a delay.
 */
export const delayTask = <A>(n: Millisecond, a: A): Task<A> =>
  new Task<A>(
    () =>
      new Promise<A>(resolve => {
        setTimeout(() => resolve(a), n);
      })
  );
