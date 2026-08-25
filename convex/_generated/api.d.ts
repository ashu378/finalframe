/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _shared from "../_shared.js";
import type * as account from "../account.js";
import type * as app from "../app.js";
import type * as assembly from "../assembly.js";
import type * as assetStorage from "../assetStorage.js";
import type * as auth from "../auth.js";
import type * as authorization from "../authorization.js";
import type * as bootstrap from "../bootstrap.js";
import type * as credits from "../credits.js";
import type * as generation from "../generation.js";
import type * as generationJobs from "../generationJobs.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as payments from "../payments.js";
import type * as planning from "../planning.js";
import type * as productions from "../productions.js";
import type * as projects from "../projects.js";
import type * as secureJobs from "../secureJobs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _shared: typeof _shared;
  account: typeof account;
  app: typeof app;
  assembly: typeof assembly;
  assetStorage: typeof assetStorage;
  auth: typeof auth;
  authorization: typeof authorization;
  bootstrap: typeof bootstrap;
  credits: typeof credits;
  generation: typeof generation;
  generationJobs: typeof generationJobs;
  http: typeof http;
  identity: typeof identity;
  payments: typeof payments;
  planning: typeof planning;
  productions: typeof productions;
  projects: typeof projects;
  secureJobs: typeof secureJobs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
