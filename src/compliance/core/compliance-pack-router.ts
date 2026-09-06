import type {
  CompliancePackDefinition,
  PackContentInput,
} from './compliance-pack';

export class CompliancePackRouter {
  constructor(private readonly packs: readonly CompliancePackDefinition[]) {}

  route(input: PackContentInput) {
    const detections = this.packs.map((pack) => ({
      pack,
      detection: pack.detect(input),
    }));
    const uncertain = detections
      .filter(({ detection }) => detection.disposition === 'UNCERTAIN')
      .sort((a, b) => b.detection.confidence - a.detection.confidence)[0];
    const matched = detections
      .filter(({ detection }) => detection.disposition === 'MATCH')
      .sort((a, b) => b.detection.confidence - a.detection.confidence)[0];
    const selectedDetection =
      uncertain &&
      (!matched ||
        uncertain.detection.confidence > matched.detection.confidence)
        ? uncertain.detection
        : matched?.detection;
    const detectedCategory = selectedDetection?.category ?? 'UNKNOWN';

    return {
      detectedCategory,
      detections: detections.map(({ pack, detection }) => ({
        packId: pack.metadata.id,
        ...detection,
      })),
      activePacks: this.packs.filter(
        (pack) =>
          pack.supportedContentTypes.includes(input.detectedContentType) &&
          pack.appliesToCategories.includes(detectedCategory),
      ),
    };
  }
}
