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
import type * as accountLifecycle from "../accountLifecycle.js";
import type * as app from "../app.js";
import type * as approvals from "../approvals.js";
import type * as assembly from "../assembly.js";
import type * as assetStorage from "../assetStorage.js";
import type * as audioCertificates from "../audioCertificates.js";
import type * as auth from "../auth.js";
import type * as authEmailLimits from "../authEmailLimits.js";
import type * as authSession from "../authSession.js";
import type * as authorization from "../authorization.js";
import type * as beatAnalysis from "../beatAnalysis.js";
import type * as beatCutContracts from "../beatCutContracts.js";
import type * as bootstrap from "../bootstrap.js";
import type * as canvasLayouts from "../canvasLayouts.js";
import type * as castReadiness from "../castReadiness.js";
import type * as characterSetup from "../characterSetup.js";
import type * as continuity from "../continuity.js";
import type * as continuityContracts from "../continuityContracts.js";
import type * as continuityPlanning from "../continuityPlanning.js";
import type * as creatorPreferences from "../creatorPreferences.js";
import type * as credits from "../credits.js";
import type * as devFixtures from "../devFixtures.js";
import type * as episodes from "../episodes.js";
import type * as financial from "../financial.js";
import type * as finishingContracts from "../finishingContracts.js";
import type * as generation from "../generation.js";
import type * as generationContinuity from "../generationContinuity.js";
import type * as generationJobs from "../generationJobs.js";
import type * as generationWorker from "../generationWorker.js";
import type * as generationWorkerContracts from "../generationWorkerContracts.js";
import type * as generationWorkerVerification from "../generationWorkerVerification.js";
import type * as graphicsAssets from "../graphicsAssets.js";
import type * as graphicsContracts from "../graphicsContracts.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as imageCertificates from "../imageCertificates.js";
import type * as imageOutputRecovery from "../imageOutputRecovery.js";
import type * as maintenanceOrphanFiles20261120 from "../maintenanceOrphanFiles20261120.js";
import type * as mediaDerivations from "../mediaDerivations.js";
import type * as migrations_projectOwnership from "../migrations/projectOwnership.js";
import type * as movieAuthority from "../movieAuthority.js";
import type * as movieExports from "../movieExports.js";
import type * as movieMergeJobs from "../movieMergeJobs.js";
import type * as movieReviews from "../movieReviews.js";
import type * as movies from "../movies.js";
import type * as outputPresets from "../outputPresets.js";
import type * as paymentWebhook from "../paymentWebhook.js";
import type * as payments from "../payments.js";
import type * as planning from "../planning.js";
import type * as planningVideo from "../planningVideo.js";
import type * as platformAdministration from "../platformAdministration.js";
import type * as platformAdministrationVerification from "../platformAdministrationVerification.js";
import type * as preparation from "../preparation.js";
import type * as preparationVerification from "../preparationVerification.js";
import type * as preparationWorker from "../preparationWorker.js";
import type * as productionDependencies from "../productionDependencies.js";
import type * as productionGraph from "../productionGraph.js";
import type * as productionOperations from "../productionOperations.js";
import type * as productions from "../productions.js";
import type * as projectMemory from "../projectMemory.js";
import type * as projectProductions from "../projectProductions.js";
import type * as projects from "../projects.js";
import type * as providerBudget from "../providerBudget.js";
import type * as providerReceipts from "../providerReceipts.js";
import type * as providerText from "../providerText.js";
import type * as providerTextContracts from "../providerTextContracts.js";
import type * as providerTextRequests from "../providerTextRequests.js";
import type * as recipeAdmissions from "../recipeAdmissions.js";
import type * as recipeAuthority from "../recipeAuthority.js";
import type * as recipeDirector from "../recipeDirector.js";
import type * as recipeErrors from "../recipeErrors.js";
import type * as recipeEstimates from "../recipeEstimates.js";
import type * as recipeInputs from "../recipeInputs.js";
import type * as recipeLocal from "../recipeLocal.js";
import type * as recipePlanning from "../recipePlanning.js";
import type * as recipeReuse from "../recipeReuse.js";
import type * as recipeRunner from "../recipeRunner.js";
import type * as recipeRuns from "../recipeRuns.js";
import type * as recipeWorkspace from "../recipeWorkspace.js";
import type * as renderGraphicsHandshake from "../renderGraphicsHandshake.js";
import type * as renderHeartbeat from "../renderHeartbeat.js";
import type * as renderHeartbeatPolicy from "../renderHeartbeatPolicy.js";
import type * as renderJobs from "../renderJobs.js";
import type * as renderRecovery from "../renderRecovery.js";
import type * as renderUploadAuthorization from "../renderUploadAuthorization.js";
import type * as renderUploadAuthorizationHttp from "../renderUploadAuthorizationHttp.js";
import type * as renderWorker from "../renderWorker.js";
import type * as renderWorkerContracts from "../renderWorkerContracts.js";
import type * as renderWorkerVerification from "../renderWorkerVerification.js";
import type * as resourceStates from "../resourceStates.js";
import type * as reviewExport from "../reviewExport.js";
import type * as reviewLinkContracts from "../reviewLinkContracts.js";
import type * as reviewMediaContract from "../reviewMediaContract.js";
import type * as scenes from "../scenes.js";
import type * as secureJobs from "../secureJobs.js";
import type * as sourceAudio from "../sourceAudio.js";
import type * as sourceAudioContracts from "../sourceAudioContracts.js";
import type * as stockVoiceVerification from "../stockVoiceVerification.js";
import type * as stockVoices from "../stockVoices.js";
import type * as storyActionChecks from "../storyActionChecks.js";
import type * as storyActionRepairs from "../storyActionRepairs.js";
import type * as storyActionReviews from "../storyActionReviews.js";
import type * as storyActionVision from "../storyActionVision.js";
import type * as storyboard from "../storyboard.js";
import type * as storyboardImageInputs from "../storyboardImageInputs.js";
import type * as storyboardImages from "../storyboardImages.js";
import type * as storyboardLineage from "../storyboardLineage.js";
import type * as studioMemberships from "../studioMemberships.js";
import type * as teamLifecycle from "../teamLifecycle.js";
import type * as templates from "../templates.js";
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
  accountLifecycle: typeof accountLifecycle;
  app: typeof app;
  approvals: typeof approvals;
  assembly: typeof assembly;
  assetStorage: typeof assetStorage;
  audioCertificates: typeof audioCertificates;
  auth: typeof auth;
  authEmailLimits: typeof authEmailLimits;
  authSession: typeof authSession;
  authorization: typeof authorization;
  beatAnalysis: typeof beatAnalysis;
  beatCutContracts: typeof beatCutContracts;
  bootstrap: typeof bootstrap;
  canvasLayouts: typeof canvasLayouts;
  castReadiness: typeof castReadiness;
  characterSetup: typeof characterSetup;
  continuity: typeof continuity;
  continuityContracts: typeof continuityContracts;
  continuityPlanning: typeof continuityPlanning;
  creatorPreferences: typeof creatorPreferences;
  credits: typeof credits;
  devFixtures: typeof devFixtures;
  episodes: typeof episodes;
  financial: typeof financial;
  finishingContracts: typeof finishingContracts;
  generation: typeof generation;
  generationContinuity: typeof generationContinuity;
  generationJobs: typeof generationJobs;
  generationWorker: typeof generationWorker;
  generationWorkerContracts: typeof generationWorkerContracts;
  generationWorkerVerification: typeof generationWorkerVerification;
  graphicsAssets: typeof graphicsAssets;
  graphicsContracts: typeof graphicsContracts;
  http: typeof http;
  identity: typeof identity;
  imageCertificates: typeof imageCertificates;
  imageOutputRecovery: typeof imageOutputRecovery;
  maintenanceOrphanFiles20261120: typeof maintenanceOrphanFiles20261120;
  mediaDerivations: typeof mediaDerivations;
  "migrations/projectOwnership": typeof migrations_projectOwnership;
  movieAuthority: typeof movieAuthority;
  movieExports: typeof movieExports;
  movieMergeJobs: typeof movieMergeJobs;
  movieReviews: typeof movieReviews;
  movies: typeof movies;
  outputPresets: typeof outputPresets;
  paymentWebhook: typeof paymentWebhook;
  payments: typeof payments;
  planning: typeof planning;
  planningVideo: typeof planningVideo;
  platformAdministration: typeof platformAdministration;
  platformAdministrationVerification: typeof platformAdministrationVerification;
  preparation: typeof preparation;
  preparationVerification: typeof preparationVerification;
  preparationWorker: typeof preparationWorker;
  productionDependencies: typeof productionDependencies;
  productionGraph: typeof productionGraph;
  productionOperations: typeof productionOperations;
  productions: typeof productions;
  projectMemory: typeof projectMemory;
  projectProductions: typeof projectProductions;
  projects: typeof projects;
  providerBudget: typeof providerBudget;
  providerReceipts: typeof providerReceipts;
  providerText: typeof providerText;
  providerTextContracts: typeof providerTextContracts;
  providerTextRequests: typeof providerTextRequests;
  recipeAdmissions: typeof recipeAdmissions;
  recipeAuthority: typeof recipeAuthority;
  recipeDirector: typeof recipeDirector;
  recipeErrors: typeof recipeErrors;
  recipeEstimates: typeof recipeEstimates;
  recipeInputs: typeof recipeInputs;
  recipeLocal: typeof recipeLocal;
  recipePlanning: typeof recipePlanning;
  recipeReuse: typeof recipeReuse;
  recipeRunner: typeof recipeRunner;
  recipeRuns: typeof recipeRuns;
  recipeWorkspace: typeof recipeWorkspace;
  renderGraphicsHandshake: typeof renderGraphicsHandshake;
  renderHeartbeat: typeof renderHeartbeat;
  renderHeartbeatPolicy: typeof renderHeartbeatPolicy;
  renderJobs: typeof renderJobs;
  renderRecovery: typeof renderRecovery;
  renderUploadAuthorization: typeof renderUploadAuthorization;
  renderUploadAuthorizationHttp: typeof renderUploadAuthorizationHttp;
  renderWorker: typeof renderWorker;
  renderWorkerContracts: typeof renderWorkerContracts;
  renderWorkerVerification: typeof renderWorkerVerification;
  resourceStates: typeof resourceStates;
  reviewExport: typeof reviewExport;
  reviewLinkContracts: typeof reviewLinkContracts;
  reviewMediaContract: typeof reviewMediaContract;
  scenes: typeof scenes;
  secureJobs: typeof secureJobs;
  sourceAudio: typeof sourceAudio;
  sourceAudioContracts: typeof sourceAudioContracts;
  stockVoiceVerification: typeof stockVoiceVerification;
  stockVoices: typeof stockVoices;
  storyActionChecks: typeof storyActionChecks;
  storyActionRepairs: typeof storyActionRepairs;
  storyActionReviews: typeof storyActionReviews;
  storyActionVision: typeof storyActionVision;
  storyboard: typeof storyboard;
  storyboardImageInputs: typeof storyboardImageInputs;
  storyboardImages: typeof storyboardImages;
  storyboardLineage: typeof storyboardLineage;
  studioMemberships: typeof studioMemberships;
  teamLifecycle: typeof teamLifecycle;
  templates: typeof templates;
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
