import type {
  TestOptions,
  TestPlanModel,
  SamplerNode,
  CsvNode,
  PlanElement,
  TimerNode,
  ScenarioModel,
} from "../types/index.js";
import type { HttpSamplerBuilder } from "../dsl/httpSampler.js";

// ─── TestPlan ─────────────────────────────────────────────────────────────────
// Singleton accumulator. The runner populates this by executing the user's
// script module, then passes it to JmxSerializer.

export class TestPlan {
  private static _instance: TestPlan | null = null;

  private _options: TestOptions | null = null;
  private _baseUrl = "";
  private _csvNodes: CsvNode[] = [];

  private _setupChildren: PlanElement[] = [];
  private _teardownChildren: PlanElement[] = [];
  private _children: PlanElement[] = []; // main

  private _setupSamplers: SamplerNode[] = [];
  private _teardownSamplers: SamplerNode[] = [];
  private _samplers: SamplerNode[] = []; // main

  private _scenarioChildren = new Map<string, PlanElement[]>();
  private _scenarioSamplers = new Map<string, SamplerNode[]>();

  private _activeContainer: PlanElement[] = this._children;
  private _activeSamplers: SamplerNode[] = this._samplers;
  private _containerStack: PlanElement[][] = [];

  static getInstance(): TestPlan {
    if (!TestPlan._instance) {
      TestPlan._instance = new TestPlan();
    }
    return TestPlan._instance;
  }

  static reset(): void {
    TestPlan._instance = null;
  }

  setScope(scope: string): void {
    this._containerStack = [];
    if (scope === "setup") {
      this._activeContainer = this._setupChildren;
      this._activeSamplers = this._setupSamplers;
    } else if (scope === "teardown") {
      this._activeContainer = this._teardownChildren;
      this._activeSamplers = this._teardownSamplers;
    } else if (scope.startsWith("scenario_")) {
      const name = scope.substring("scenario_".length);
      if (!this._scenarioChildren.has(name)) {
        this._scenarioChildren.set(name, []);
        this._scenarioSamplers.set(name, []);
      }
      this._activeContainer = this._scenarioChildren.get(name)!;
      this._activeSamplers = this._scenarioSamplers.get(name)!;
    } else {
      this._activeContainer = this._children;
      this._activeSamplers = this._samplers;
    }
  }

  pushContainer(container: PlanElement[]): void {
    this._containerStack.push(this._activeContainer);
    this._activeContainer = container;
  }

  popContainer(): void {
    const parent = this._containerStack.pop();
    if (parent) {
      this._activeContainer = parent;
    }
  }

  addChild(node: PlanElement): void {
    this._activeContainer.push(node);
    this._collectSamplers(node);
  }

  private _collectSamplers(node: PlanElement): void {
    if (node.type === "sampler") {
      this._activeSamplers.push(node);
    } else if (node.type === "group") {
      for (const child of node.children) {
        this._collectSamplers(child);
      }
    }
  }

  setOptions(options: TestOptions): void {
    this._options = options;
  }

  setBaseUrl(url: string): void {
    this._baseUrl = url;
  }

  addCsv(node: CsvNode): void {
    this._csvNodes.push(node);
  }

  addSampler(builder: HttpSamplerBuilder): void {
    this.addChild(builder.build());
  }

  addTimer(node: TimerNode): void {
    this.addChild(node);
  }

  validate(): void {
    if (!this._options) {
      throw new Error(
        "TestPlan: export const options = { vus, duration } is required in your script."
      );
    }
    if (!this._baseUrl) {
      throw new Error(
        "TestPlan: export const baseUrl is required in your script."
      );
    }

    let totalSamplers = this._samplers.length + this._setupSamplers.length + this._teardownSamplers.length;
    for (const samplers of this._scenarioSamplers.values()) {
      totalSamplers += samplers.length;
    }

    if (totalSamplers === 0) {
      throw new Error(
        "TestPlan: No HTTP samplers found. Did you export a default function or scenario functions?"
      );
    }
  }

  toModel(): TestPlanModel {
    this.validate();

    const scenariosList: ScenarioModel[] = [];
    if (this._options?.scenarios) {
      for (const [name, config] of Object.entries(this._options.scenarios)) {
        scenariosList.push({
          name,
          config,
          children: this._scenarioChildren.get(name) ?? [],
          samplers: this._scenarioSamplers.get(name) ?? [],
        });
      }
    }

    return {
      options: this._options!,
      baseUrl: this._baseUrl,
      csvNodes: [...this._csvNodes],
      children: [...this._children],
      samplers: [...this._samplers],
      setupChildren: [...this._setupChildren],
      teardownChildren: [...this._teardownChildren],
      setupSamplers: [...this._setupSamplers],
      teardownSamplers: [...this._teardownSamplers],
      scenarios: scenariosList,
    };
  }
}
