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
import type * as approvals from "../approvals.js";
import type * as assembly from "../assembly.js";
import type * as assetStorage from "../assetStorage.js";
import type * as auth from "../auth.js";
import type * as authorization from "../authorization.js";
import type * as bootstrap from "../bootstrap.js";
import type * as canvasLayouts from "../canvasLayouts.js";
import type * as continuity from "../continuity.js";
import type * as continuityContracts from "../continuityContracts.js";
import type * as continuityPlanning from "../continuityPlanning.js";
import type * as credits from "../credits.js";
import type * as devFixtures from "../devFixtures.js";
import type * as episodes from "../episodes.js";
import type * as financial from "../financial.js";
import type * as generation from "../generation.js";
import type * as generationContinuity from "../generationContinuity.js";
import type * as generationJobs from "../generationJobs.js";
import type * as generationWorker from "../generationWorker.js";
import type * as generationWorkerContracts from "../generationWorkerContracts.js";
import type * as generationWorkerVerification from "../generationWorkerVerification.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as migrations_projectOwnership from "../migrations/projectOwnership.js";
import type * as paymentWebhook from "../paymentWebhook.js";
import type * as payments from "../payments.js";
import type * as planning from "../planning.js";
import type * as preparation from "../preparation.js";
import type * as preparationVerification from "../preparationVerification.js";
import type * as preparationWorker from "../preparationWorker.js";
import type * as productionGraph from "../productionGraph.js";
import type * as productionOperations from "../productionOperations.js";
import type * as productions from "../productions.js";
import type * as projectProductions from "../projectProductions.js";
import type * as projects from "../projects.js";
import type * as providerBudget from "../providerBudget.js";
import type * as providerReceipts from "../providerReceipts.js";
import type * as providerText from "../providerText.js";
import type * as providerTextContracts from "../providerTextContracts.js";
import type * as providerTextRequests from "../providerTextRequests.js";
import type * as renderJobs from "../renderJobs.js";
import type * as renderWorker from "../renderWorker.js";
import type * as renderWorkerContracts from "../renderWorkerContracts.js";
import type * as renderWorkerVerification from "../renderWorkerVerification.js";
import type * as resourceStates from "../resourceStates.js";
import type * as reviewExport from "../reviewExport.js";
import type * as reviewLinkContracts from "../reviewLinkContracts.js";
import type * as scenes from "../scenes.js";
import type * as secureJobs from "../secureJobs.js";
import type * as stockVoiceVerification from "../stockVoiceVerification.js";
import type * as stockVoices from "../stockVoices.js";
import type * as timeline from "../timeline.js";
import type * as timelineEditor from "../timelineEditor.js";
import type * as videoRouting from "../videoRouting.js";
import type * as voices from "../voices.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _shared: typeof _shared;
  account: typeof account;
  app: typeof app;
  approvals: typeof approvals;
  assembly: typeof assembly;
  assetStorage: typeof assetStorage;
  auth: typeof auth;
  authorization: typeof authorization;
  bootstrap: typeof bootstrap;
  canvasLayouts: typeof canvasLayouts;
  continuity: typeof continuity;
  continuityContracts: typeof continuityContracts;
  continuityPlanning: typeof continuityPlanning;
  credits: typeof credits;
  devFixtures: typeof devFixtures;
  episodes: typeof episodes;
  financial: typeof financial;
  generation: typeof generation;
  generationContinuity: typeof generationContinuity;
  generationJobs: typeof generationJobs;
  generationWorker: typeof generationWorker;
  generationWorkerContracts: typeof generationWorkerContracts;
  generationWorkerVerification: typeof generationWorkerVerification;
  http: typeof http;
  identity: typeof identity;
  "migrations/projectOwnership": typeof migrations_projectOwnership;
  paymentWebhook: typeof paymentWebhook;
  payments: typeof payments;
  planning: typeof planning;
  preparation: typeof preparation;
  preparationVerification: typeof preparationVerification;
  preparationWorker: typeof preparationWorker;
  productionGraph: typeof productionGraph;
  productionOperations: typeof productionOperations;
  productions: typeof productions;
  projectProductions: typeof projectProductions;
  projects: typeof projects;
  providerBudget: typeof providerBudget;
  providerReceipts: typeof providerReceipts;
  providerText: typeof providerText;
  providerTextContracts: typeof providerTextContracts;
  providerTextRequests: typeof providerTextRequests;
  renderJobs: typeof renderJobs;
  renderWorker: typeof renderWorker;
  renderWorkerContracts: typeof renderWorkerContracts;
  renderWorkerVerification: typeof renderWorkerVerification;
  resourceStates: typeof resourceStates;
  reviewExport: typeof reviewExport;
  reviewLinkContracts: typeof reviewLinkContracts;
  scenes: typeof scenes;
  secureJobs: typeof secureJobs;
  stockVoiceVerification: typeof stockVoiceVerification;
  stockVoices: typeof stockVoices;
  timeline: typeof timeline;
  timelineEditor: typeof timelineEditor;
  videoRouting: typeof videoRouting;
  voices: typeof voices;
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
