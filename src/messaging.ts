import { Effect, Schema } from 'effect';
import { browser } from 'wxt/browser';
import { Response, type Request } from './model';

export function send(request: Request): Promise<Response> {
  return Effect.runPromise(
    Effect.tryPromise({
      try: () => browser.runtime.sendMessage(request) as Promise<unknown>,
      catch: () => new Error('Reload the page to reconnect Doomblock.'),
    }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Response))),
  );
}
