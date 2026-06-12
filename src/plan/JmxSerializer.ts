import { create } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces.js";
import type {
  TestPlanModel,
  SamplerNode,
  CsvNode,
  PlanElement,
  TimerNode,
  GroupNode,
} from "../types/index.js";
import {
  parseDurationToSeconds,
  parseBaseUrl,
  resolveBody,
  inferContentType,
  addExtractor,
  addAssertion,
  addBackendListener,
} from "./JmxSerializerHelpers.js";

// ─── JmxSerializer ────────────────────────────────────────────────────────────
// Converts a TestPlanModel into a valid JMeter JMX XML string.
// Targets JMeter 5.6+ format.

export class JmxSerializer {
  serialize(model: TestPlanModel): string {
    const {
      options,
      baseUrl,
      csvNodes,
      children,
      setupChildren,
      teardownChildren,
      scenarios,
    } = model;

    const doc = create({ version: "1.0", encoding: "UTF-8" })
      .ele("jmeterTestPlan", {
        version: "1.2",
        properties: "5.0",
        jmeter: "5.6.3",
      });

    const hashTree = doc.ele("hashTree");

    // ── Test Plan element ───────────────────────────────────────────────────
    hashTree
      .ele("TestPlan", {
        guiclass: "TestPlanGui",
        testclass: "TestPlan",
        testname: "j5 Test Plan",
        enabled: "true",
      })
      .ele("boolProp", { name: "TestPlan.functional_mode" }).txt("false").up()
      .ele("boolProp", { name: "TestPlan.serialize_threadgroups" }).txt("false").up()
      .ele("elementProp", {
        name: "TestPlan.user_defined_variables",
        elementType: "Arguments",
      })
        .ele("collectionProp", { name: "Arguments.arguments" }).up()
      .up();

    const planHashTree = hashTree.ele("hashTree");

    // ── HTTP Request Defaults ───────────────────────────────────────────────
    const parsedUrl = parseBaseUrl(baseUrl);
    planHashTree
      .ele("ConfigTestElement", {
        guiclass: "HttpDefaultsGui",
        testclass: "ConfigTestElement",
        testname: "HTTP Request Defaults",
        enabled: "true",
      })
      .ele("stringProp", { name: "HTTPSampler.domain" }).txt(parsedUrl.host).up()
      .ele("stringProp", { name: "HTTPSampler.port" }).txt(parsedUrl.port).up()
      .ele("stringProp", { name: "HTTPSampler.protocol" }).txt(parsedUrl.protocol).up()
      .ele("stringProp", { name: "HTTPSampler.path" }).txt("").up()
      .ele("boolProp", { name: "HTTPSampler.follow_redirects" }).txt("true").up();

    planHashTree.ele("hashTree");

    // ── CSV Data Sets ───────────────────────────────────────────────────────
    for (const csv of csvNodes) {
      this._addCsvDataSet(planHashTree, csv);
      planHashTree.ele("hashTree");
    }

    // ── Setup Thread Group ──────────────────────────────────────────────────
    if (setupChildren && setupChildren.length > 0) {
      planHashTree
        .ele("SetupThreadGroup", {
          guiclass: "SetupThreadGroupGui",
          testclass: "SetupThreadGroup",
          testname: "setUp Thread Group",
          enabled: "true",
        })
        .ele("stringProp", { name: "ThreadGroup.on_sample_error" }).txt("continue").up()
        .ele("stringProp", { name: "ThreadGroup.num_threads" }).txt("1").up()
        .ele("stringProp", { name: "ThreadGroup.ramp_time" }).txt("1").up()
        .ele("boolProp", { name: "ThreadGroup.scheduler" }).txt("false").up()
        .ele("elementProp", {
          name: "ThreadGroup.main_controller",
          elementType: "LoopController",
          guiclass: "LoopControlPanel",
          testclass: "LoopController",
          testname: "Loop Controller",
          enabled: "true",
        })
          .ele("boolProp", { name: "LoopController.continue_forever" }).txt("false").up()
          .ele("stringProp", { name: "LoopController.loops" }).txt("1").up()
        .up();

      const setupHashTree = planHashTree.ele("hashTree");
      this._addChildren(setupHashTree, setupChildren);
    }

    // ── Thread Groups (Scenarios or Main) ───────────────────────────────────
    if (scenarios && scenarios.length > 0) {
      for (const scenario of scenarios) {
        const rampUpSecs = parseDurationToSeconds(scenario.config.rampUp ?? "0s");
        const durationSecs = parseDurationToSeconds(scenario.config.duration ?? options.duration ?? "0s");
        this._addThreadGroup(
          planHashTree,
          `Scenario - ${scenario.name} (${scenario.config.vus} VUs)`,
          scenario.config.vus,
          rampUpSecs,
          durationSecs,
          scenario.children
        );
      }
    } else {
      const rampUpSecs = parseDurationToSeconds(options.rampUp ?? "0s");
      const durationSecs = parseDurationToSeconds(options.duration ?? "0s");
      this._addThreadGroup(
        planHashTree,
        `Thread Group - ${options.vus ?? 1} VUs`,
        options.vus ?? 1,
        rampUpSecs,
        durationSecs,
        children
      );
    }

    // ── Teardown Thread Group ───────────────────────────────────────────────
    if (teardownChildren && teardownChildren.length > 0) {
      planHashTree
        .ele("PostThreadGroup", {
          guiclass: "PostThreadGroupGui",
          testclass: "PostThreadGroup",
          testname: "tearDown Thread Group",
          enabled: "true",
        })
        .ele("stringProp", { name: "ThreadGroup.on_sample_error" }).txt("continue").up()
        .ele("stringProp", { name: "ThreadGroup.num_threads" }).txt("1").up()
        .ele("stringProp", { name: "ThreadGroup.ramp_time" }).txt("1").up()
        .ele("boolProp", { name: "ThreadGroup.scheduler" }).txt("false").up()
        .ele("elementProp", {
          name: "ThreadGroup.main_controller",
          elementType: "LoopController",
          guiclass: "LoopControlPanel",
          testclass: "LoopController",
          testname: "Loop Controller",
          enabled: "true",
        })
          .ele("boolProp", { name: "LoopController.continue_forever" }).txt("false").up()
          .ele("stringProp", { name: "LoopController.loops" }).txt("1").up()
        .up();

      const postHashTree = planHashTree.ele("hashTree");
      this._addChildren(postHashTree, teardownChildren);
    }

    // ── Summary Report Listener (Plan Level) ────────────────────────────────
    planHashTree
      .ele("ResultCollector", {
        guiclass: "SummaryReport",
        testclass: "ResultCollector",
        testname: "Summary Report",
        enabled: "true",
      })
      .ele("boolProp", { name: "ResultCollector.error_logging" }).txt("false").up()
      .ele("objProp")
        .ele("name").txt("saveConfig").up()
        .ele("value", { class: "SampleSaveConfiguration" })
          .ele("time").txt("true").up()
          .ele("latency").txt("true").up()
          .ele("timestamp").txt("true").up()
          .ele("success").txt("true").up()
          .ele("label").txt("true").up()
          .ele("code").txt("true").up()
          .ele("message").txt("true").up()
          .ele("threadName").txt("true").up()
          .ele("bytes").txt("true").up()
          .ele("url").txt("true").up()
        .up()
      .up()
      .ele("stringProp", { name: "filename" }).txt("results.jtl").up();

    planHashTree.ele("hashTree");

    // ── Backend Listeners ───────────────────────────────────────────────────
    if (options.backends && options.backends.length > 0) {
      for (const backend of options.backends) {
        addBackendListener(planHashTree, backend);
        planHashTree.ele("hashTree");
      }
    }

    return doc.end({ prettyPrint: true });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _addThreadGroup(
    parent: XMLBuilder,
    name: string,
    vus: number,
    rampUpSecs: number,
    durationSecs: number,
    children: PlanElement[]
  ): void {
    parent
      .ele("ThreadGroup", {
        guiclass: "ThreadGroupGui",
        testclass: "ThreadGroup",
        testname: name,
        enabled: "true",
      })
      .ele("intProp", { name: "ThreadGroup.num_threads" }).txt(String(vus)).up()
      .ele("intProp", { name: "ThreadGroup.ramp_time" }).txt(String(rampUpSecs)).up()
      .ele("boolProp", { name: "ThreadGroup.same_user_on_next_iteration" }).txt("true").up()
      .ele("boolProp", { name: "ThreadGroup.scheduler" }).txt("true").up()
      .ele("stringProp", { name: "ThreadGroup.duration" }).txt(String(durationSecs)).up()
      .ele("stringProp", { name: "ThreadGroup.delay" }).txt("0").up()
      .ele("elementProp", {
        name: "ThreadGroup.main_controller",
        elementType: "LoopController",
        guiclass: "LoopControlPanel",
        testclass: "LoopController",
        testname: "Loop Controller",
        enabled: "true",
      })
        .ele("boolProp", { name: "LoopController.continue_forever" }).txt("true").up()
        .ele("intProp", { name: "LoopController.loops" }).txt("-1").up()
      .up();

    const tgHashTree = parent.ele("hashTree");
    this._addChildren(tgHashTree, children);
  }

  private _addChildren(parent: XMLBuilder, elements: PlanElement[]): void {
    for (const el of elements) {
      if (el.type === "sampler") {
        this._addHttpSampler(parent, el);
      } else if (el.type === "timer") {
        this._addTimer(parent, el);
      } else if (el.type === "group") {
        this._addGroup(parent, el);
      }
    }
  }

  private _addTimer(parent: XMLBuilder, timer: TimerNode): void {
    const actionEl = parent.ele("TestAction", {
      guiclass: "TestActionGui",
      testclass: "TestAction",
      testname: "Pause",
      enabled: "true",
    });
    actionEl.ele("intProp", { name: "ActionProcessor.action" }).txt("1").up();
    actionEl.ele("intProp", { name: "ActionProcessor.target" }).txt("0").up();
    actionEl.ele("stringProp", { name: "ActionProcessor.duration" }).txt("0").up();

    const actionHashTree = parent.ele("hashTree");

    if (timer.timerType === "constant") {
      actionHashTree
        .ele("ConstantTimer", {
          guiclass: "ConstantTimerGui",
          testclass: "ConstantTimer",
          testname: "Constant Timer",
          enabled: "true",
        })
        .ele("stringProp", { name: "ConstantTimer.delay" }).txt(timer.delay).up();
    } else if (timer.timerType === "uniform") {
      actionHashTree
        .ele("UniformRandomTimer", {
          guiclass: "UniformRandomTimerGui",
          testclass: "UniformRandomTimer",
          testname: "Uniform Random Timer",
          enabled: "true",
        })
        .ele("stringProp", { name: "ConstantTimer.delay" }).txt(timer.delay).up()
        .ele("stringProp", { name: "RandomTimer.range" }).txt(timer.range ?? "0").up();
    } else if (timer.timerType === "gaussian") {
      actionHashTree
        .ele("GaussianRandomTimer", {
          guiclass: "GaussianRandomTimerGui",
          testclass: "GaussianRandomTimer",
          testname: "Gaussian Random Timer",
          enabled: "true",
        })
        .ele("stringProp", { name: "ConstantTimer.delay" }).txt(timer.delay).up()
        .ele("stringProp", { name: "RandomTimer.range" }).txt(timer.range ?? "0").up();
    }

    actionHashTree.ele("hashTree");
  }

  private _addGroup(parent: XMLBuilder, group: GroupNode): void {
    parent
      .ele("TransactionController", {
        guiclass: "TransactionControllerGui",
        testclass: "TransactionController",
        testname: group.name,
        enabled: "true",
      })
      .ele("boolProp", { name: "TransactionController.includeTimers" }).txt("false").up()
      .ele("boolProp", { name: "TransactionController.parent" }).txt("false").up();

    const groupHashTree = parent.ele("hashTree");
    this._addChildren(groupHashTree, group.children);
  }

  private _addCsvDataSet(parent: XMLBuilder, csv: CsvNode): void {
    const cfg = csv.config;
    const csvEl = parent.ele("CSVDataSet", {
      guiclass: "TestBeanGUI",
      testclass: "CSVDataSet",
      testname: `CSV Data Set - ${cfg.filename}`,
      enabled: "true",
    });

    csvEl.ele("stringProp", { name: "filename" }).txt(cfg.filename).up();
    csvEl.ele("stringProp", { name: "delimiter" }).txt(cfg.delimiter ?? ",").up();
    csvEl.ele("boolProp", { name: "quotedData" }).txt("false").up();
    csvEl.ele("boolProp", { name: "recycle" }).txt(String(cfg.recycle ?? true)).up();
    csvEl.ele("boolProp", { name: "stopThread" }).txt(String(cfg.stopThread ?? false)).up();
    csvEl.ele("stringProp", { name: "shareMode" })
      .txt(`shareMode.${cfg.shareMode ?? "all"}`).up();

    if (cfg.variableNames && cfg.variableNames.length > 0) {
      csvEl
        .ele("stringProp", { name: "variableNames" })
        .txt(cfg.variableNames.join(","))
        .up();
    }
  }

  private _addHttpSampler(parent: XMLBuilder, sampler: SamplerNode): void {
    const { name, method, path, config } = sampler;
    const body = resolveBody(config.body);
    const contentType = config.contentType ?? inferContentType(config.body);

    const el = parent.ele("HTTPSamplerProxy", {
      guiclass: "HttpTestSampleGui",
      testclass: "HTTPSamplerProxy",
      testname: name,
      enabled: "true",
    });

    el.ele("stringProp", { name: "HTTPSampler.method" }).txt(method).up();
    el.ele("stringProp", { name: "HTTPSampler.path" }).txt(path).up();
    el.ele("boolProp", { name: "HTTPSampler.follow_redirects" })
      .txt(String(config.followRedirects ?? true)).up();
    el.ele("boolProp", { name: "HTTPSampler.auto_redirects" }).txt("false").up();
    el.ele("boolProp", { name: "HTTPSampler.use_keepalive" }).txt("true").up();
    el.ele("boolProp", { name: "HTTPSampler.DO_MULTIPART_POST" }).txt("false").up();

    if (config.connectTimeout !== undefined) {
      el.ele("stringProp", { name: "HTTPSampler.connect_timeout" })
        .txt(String(config.connectTimeout)).up();
    }
    if (config.responseTimeout !== undefined) {
      el.ele("stringProp", { name: "HTTPSampler.response_timeout" })
        .txt(String(config.responseTimeout)).up();
    }

    // POST/PUT/PATCH body
    if (body && ["POST", "PUT", "PATCH"].includes(method)) {
      el.ele("boolProp", { name: "HTTPSampler.postBodyRaw" }).txt("true").up()
        .ele("elementProp", {
          name: "HTTPSampler.Arguments",
          elementType: "Arguments",
        })
          .ele("collectionProp", { name: "Arguments.arguments" })
            .ele("elementProp", { name: "", elementType: "HTTPArgument" })
              .ele("boolProp", { name: "HTTPArgument.always_encode" }).txt("false").up()
              .ele("stringProp", { name: "Argument.value" }).txt(body).up()
              .ele("stringProp", { name: "Argument.metadata" }).txt("=").up();
    }

    const samplerHashTree = parent.ele("hashTree");

    // Header Manager
    const headers: Record<string, string> = {
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(config.headers ?? {}),
    };

    if (Object.keys(headers).length > 0) {
      const hmCollection = samplerHashTree
        .ele("HeaderManager", {
          guiclass: "HeaderPanel",
          testclass: "HeaderManager",
          testname: "HTTP Header Manager",
          enabled: "true",
        })
        .ele("collectionProp", { name: "HeaderManager.headers" });

      for (const [k, v] of Object.entries(headers)) {
        hmCollection
          .ele("elementProp", { name: "", elementType: "Header" })
          .ele("stringProp", { name: "Header.name" }).txt(k).up()
          .ele("stringProp", { name: "Header.value" }).txt(v).up();
      }
      samplerHashTree.ele("hashTree");
    }

    // Extractors
    for (const ext of sampler.extractors) {
      addExtractor(samplerHashTree, ext);
      samplerHashTree.ele("hashTree");
    }

    // Assertions
    for (const assertion of sampler.assertions) {
      addAssertion(samplerHashTree, assertion);
      samplerHashTree.ele("hashTree");
    }
  }
}
