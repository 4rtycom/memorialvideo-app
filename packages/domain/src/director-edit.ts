import {
  DEFAULT_FPS,
  IMAGE_MAX_FRAMES,
  IMAGE_MIN_FRAMES,
  parseTimelineContract,
  type DirectorLock,
  type DirectorV2Brief,
  type DirectorV2Operation,
  type DirectorV2Patch,
  type EditIntent,
  type EditPlan,
  type EditPlanChange,
  type NaturalLanguageEditRequest,
  type StoryApproval,
  type StoryPlan,
  type TimelineContract,
  type TimelineScene,
  directorV2PatchSchema,
  editIntentSchema,
  editPlanSchema,
  naturalLanguageEditRequestSchema,
} from '@memorialvideo/contracts';

import {
  applyDirectorOperations,
  hashStoryPlan,
  hashTimeline,
  hashUnaffectedScenes,
  invertDirectorOperations,
  parseDirectorBrief,
  regenerateDirectorChapter,
  type KnownDirectorAsset,
} from './director-v2';
import { applyAutomaticDucking } from './audio-mix';

const DETERMINISTIC_EDIT_PROVENANCE = {
  provider: 'deterministic-edit-interpreter',
  model: 'local-v1',
  version: 'v1',
  kind: 'deterministic' as const,
};

function changeEntry(partial: Omit<EditPlanChange, 'beforeLabel' | 'afterLabel' | 'protected'> & Partial<EditPlanChange>): EditPlanChange {
  return {
    beforeLabel: '',
    afterLabel: '',
    protected: false,
    ...partial,
  };
}

function clampImage(frames: number): number {
  return Math.min(IMAGE_MAX_FRAMES, Math.max(IMAGE_MIN_FRAMES, Math.round(frames)));
}

function totalDuration(timeline: TimelineContract): number {
  return timeline.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
}

function sceneAssetId(scene: TimelineScene): string | undefined {
  return scene.type === 'image' || scene.type === 'video' ? scene.asset.assetId : undefined;
}

function chapterBlocks(timeline: TimelineContract) {
  const blocks: Array<{ chapterId: string; title: string; sceneIds: string[]; start: number; end: number }> = [];
  let current: { chapterId: string; title: string; sceneIds: string[]; start: number; end: number } | null = null;
  timeline.scenes.forEach((scene, index) => {
    if (scene.type === 'chapter') {
      if (current) {
        current.end = index;
        blocks.push(current);
      }
      const chapterId = scene.id.startsWith('chapter-') ? scene.id.slice('chapter-'.length) : scene.id;
      current = { chapterId, title: scene.title, sceneIds: [scene.id], start: index, end: index + 1 };
      return;
    }
    if (current && scene.type !== 'intro' && scene.type !== 'outro') {
      current.sceneIds.push(scene.id);
      current.end = index + 1;
    }
  });
  if (current) {
    blocks.push(current);
  }
  return blocks;
}

function findChapterBlock(timeline: TimelineContract, chapterId: string) {
  return chapterBlocks(timeline).find(
    (block) => block.chapterId === chapterId || block.sceneIds[0] === `chapter-${chapterId}`,
  );
}

function lockConflicts(locks: readonly DirectorLock[], operations: readonly DirectorV2Operation[]): string[] {
  const issues: string[] = [];
  const keepDuration = new Set(locks.filter((lock) => lock.kind === 'keep_duration').map((lock) => lock.targetId));
  const keepCrop = new Set(locks.filter((lock) => lock.kind === 'keep_crop').map((lock) => lock.targetId));
  const keepText = new Set(locks.filter((lock) => lock.kind === 'keep_text').map((lock) => lock.targetId));
  const keepTransition = new Set(locks.filter((lock) => lock.kind === 'keep_transition').map((lock) => lock.targetId));
  const keepPosition = new Set(locks.filter((lock) => lock.kind === 'keep_position').map((lock) => lock.targetId));
  for (const operation of operations) {
    if (operation.op === 'update_duration' && keepDuration.has(operation.sceneId)) {
      issues.push('manual_lock');
    }
    if (operation.op === 'update_crop' && keepCrop.has(operation.sceneId)) {
      issues.push('manual_lock');
    }
    if (operation.op === 'update_text' && keepText.has(operation.sceneId)) {
      issues.push('manual_lock');
    }
    if (operation.op === 'update_transition' && keepTransition.has(operation.sceneId)) {
      issues.push('manual_lock');
    }
    if (operation.op === 'move_scene' && keepPosition.has(operation.sceneId)) {
      issues.push('manual_lock');
    }
  }
  return [...new Set(issues)];
}

export function sanitizeEditInstruction(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 ? ' ' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

export function interpretDeterministicEdit(input: {
  request: NaturalLanguageEditRequest;
  timeline: TimelineContract;
  storyPlan: StoryPlan;
  approval: StoryApproval;
  locks?: readonly DirectorLock[];
}):
  | { ok: true; intent: EditIntent; changeTimeline: false }
  | { ok: false; intent: EditIntent; changeTimeline: false } {
  const request = naturalLanguageEditRequestSchema.parse({
    ...input.request,
    instruction: sanitizeEditInstruction(input.request.instruction),
  });
  const text = request.instruction.toLowerCase();
  const locks = input.locks ?? [];
  const base = {
    schemaVersion: 1 as const,
    id: `ei_${request.id.slice(-12)}`,
    requestId: request.id,
    requiredLocks: [...locks],
    provenance: DETERMINISTIC_EDIT_PROVENANCE,
    clarifyingQuestions: [] as EditIntent['clarifyingQuestions'],
    explanation: [] as string[],
  };

  if (/ignore (previous|all) instructions|system prompt|reveal (the )?prompt/i.test(text)) {
    return {
      ok: false,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'edit.revert',
        scope: 'last_edit',
        capabilityStatus: 'unsafe',
        capabilityCode: 'unsafe_request',
        validationStatus: 'invalid',
        explanation: ['That instruction looks unsafe and will not be applied.'],
      }),
    };
  }

  if (/grandchildren|this person|photos? containing|face|recognis|recogniz/i.test(text) && !request.selectedAssetId) {
    const needsPerson = /this person|photos? containing|face/i.test(text);
    return {
      ok: false,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'memory.exclude',
        scope: 'memory',
        capabilityStatus: needsPerson ? 'impossible' : 'needs_information',
        capabilityCode: needsPerson ? 'person_detection_unavailable' : 'needs_person_context',
        validationStatus: 'pending_clarification',
        clarifyingQuestions: needsPerson ? [] : [{ id: 'q_person', code: 'person_selection', choices: [] }],
        explanation: needsPerson
          ? ['Person detection is not available yet. Select the memories to remove by hand.']
          : ['Select or identify the memories that show grandchildren before this change can run.'],
      }),
    };
  }

  if (/less sad|more joyful|emotion|mood of (this|the) section/i.test(text)) {
    const axis = request.clarificationAnswers.q_emotion ?? request.clarificationAnswers.emotion_axis;
    if (axis === 'pacing' && (request.selectedChapterId || request.selectedSceneId)) {
      return {
        ok: true,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: request.selectedSceneId ? 'scene.adjust_duration' : 'chapter.adjust_duration',
          scope: request.selectedSceneId ? 'scene' : 'chapter',
          targetSceneId: request.selectedSceneId,
          targetChapterId: request.selectedChapterId,
          durationFactor: 1.15,
          capabilityStatus: 'supported',
          explanation: ['Adjusting pacing for the selected section. Emotional understanding is not claimed.'],
        }),
      };
    }
    return {
      ok: false,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'chapter.adjust_duration',
        scope: 'chapter',
        targetChapterId: request.selectedChapterId,
        capabilityStatus: 'needs_clarification',
        capabilityCode: 'needs_emotion_axis',
        validationStatus: 'pending_clarification',
        clarifyingQuestions: [
          {
            id: 'q_emotion',
            code: 'emotion_axis',
            choices: [
              { id: 'pacing', labelKey: 'directorEdit.choice.pacing' },
              { id: 'memories', labelKey: 'directorEdit.choice.memories' },
              { id: 'text', labelKey: 'directorEdit.choice.text' },
              { id: 'music', labelKey: 'directorEdit.choice.music' },
            ],
          },
        ],
        explanation: [
          'Say whether you want different pacing, memories, text, or music mood. Emotional understanding is not claimed.',
        ],
      }),
    };
  }

  if (/translate.*(german|deutsch)|into german/i.test(text)) {
    return {
      ok: false,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'scene.adjust_duration',
        scope: 'film',
        capabilityStatus: 'planned',
        capabilityCode: 'translation_partial',
        validationStatus: 'invalid',
        explanation: [
          'Narration and subtitle translation are not available yet. Only existing on-screen text can be edited manually.',
        ],
      }),
    };
  }

  if (/duck(ing)? (the )?music|lower (the )?music (under|during) (speech|narration)|automatic ducking/i.test(text)) {
    if (!input.timeline.audio) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'audio.enable_ducking',
          scope: 'audio',
          capabilityStatus: 'needs_information',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          explanation: [
            'Propose a Guided Audio mix first (speech + rights-declared music), then ducking can be applied.',
          ],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'audio.enable_ducking',
        scope: 'audio',
        capabilityStatus: 'supported',
        explanation: ['Enable automatic music ducking during speech and narration.'],
      }),
    };
  }

  if (/attach subtitles|burn[- ]?in subtitles|show subtitles/i.test(text)) {
    if (!input.timeline.audio?.subtitles.length) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'audio.attach_subtitles',
          scope: 'audio',
          capabilityStatus: 'needs_information',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          explanation: ['Add timestamped subtitle cues via Guided Audio before attaching them to the film.'],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'audio.attach_subtitles',
        scope: 'audio',
        capabilityStatus: 'supported',
        explanation: ['Attach the prepared subtitle track for burn-in.'],
      }),
    };
  }

  if (/select (the )?narration|use (the )?narration take|choose narration/i.test(text)) {
    const takeId = input.timeline.audio?.narrationTakes.find((take) => take.approved)?.id;
    if (!takeId) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'audio.select_narration',
          scope: 'audio',
          capabilityStatus: 'needs_information',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          explanation: [
            'Upload an approved narration take first. Voice cloning and production TTS remain unavailable.',
          ],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'audio.select_narration',
        scope: 'audio',
        targetAssetId: takeId,
        capabilityStatus: 'supported',
        explanation: ['Select the approved uploaded narration take. TTS and voice recreation stay blocked.'],
      }),
    };
  }

  if (/ceremony[- ]safe (audio|loudness|mix)|dialogue priority|music forward/i.test(text)) {
    const profile = /dialogue/.test(text)
      ? 'dialogue_priority'
      : /music forward/.test(text)
        ? 'music_forward'
        : 'ceremony_safe';
    if (!input.timeline.audio) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'audio.master_profile',
          scope: 'audio',
          capabilityStatus: 'needs_information',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          explanation: ['Propose a Guided Audio mix before changing the master loudness profile.'],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'audio.master_profile',
        scope: 'audio',
        capabilityStatus: 'supported',
        explanation: [`Set the master audio profile to ${profile}.`],
        clarifyingQuestions: [],
        // stash profile in explanation; compile reads from instruction
      }),
    };
  }

  if (/clone (the )?voice|voice recreation|synthesi[sz]e (a )?voice|tts narrat/i.test(text)) {
    return {
      ok: false,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'audio.select_narration',
        scope: 'audio',
        capabilityStatus: 'unsafe',
        capabilityCode: 'unsafe_request',
        validationStatus: 'invalid',
        explanation: [
          'Voice cloning and production TTS are blocked pending legal review. Upload a narration take instead.',
        ],
      }),
    };
  }

  if (/five[- ]minute|5[- ]minute|ceremony version|output variant/i.test(text) && /create|make|build/i.test(text)) {
    return {
      ok: false,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'film.target_duration',
        scope: 'film',
        durationFrames: 5 * 60 * DEFAULT_FPS,
        capabilityStatus: 'planned',
        capabilityCode: 'variant_planned',
        validationStatus: 'invalid',
        explanation: [
          'A separate five-minute ceremony variant is planned. This will not overwrite the canonical full film.',
        ],
      }),
    };
  }

  if (/restore (prior|previous|earlier)|return to (version|prior)/i.test(text) || request.scope === 'version') {
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'version.restore',
        scope: 'version',
        versionId: request.clarificationAnswers.versionId,
        patchId: request.clarificationAnswers.patchId ?? text.match(/pt_[a-z0-9]+/i)?.[0],
        capabilityStatus: 'supported',
        explanation: ['Restore the selected Director version through a previewable patch.'],
      }),
    };
  }

  if (/revert (the )?(last|latest)|undo (the )?(last|latest)/i.test(text) || request.scope === 'last_edit') {
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'edit.revert',
        scope: 'last_edit',
        capabilityStatus: 'supported',
        explanation: ['Revert the latest safe Director edit if it does not overlap later manual changes.'],
      }),
    };
  }

  if (
    /regenerate (this |the )?(scene|clip|photograph|image)/i.test(text) ||
    (request.scope === 'scene' && /regenerate/i.test(text))
  ) {
    if (!request.selectedSceneId) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'scene.regenerate',
          scope: 'scene',
          capabilityStatus: 'needs_clarification',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          clarifyingQuestions: [{ id: 'q_scene', code: 'which_scene', choices: [] }],
          explanation: ['Select the scene to regenerate.'],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'scene.regenerate',
        scope: 'scene',
        targetSceneId: request.selectedSceneId,
        capabilityStatus: 'supported',
        explanation: ['Regenerate only the selected scene while locking the rest of the film.'],
      }),
    };
  }

  if (/regenerate (this |the )?chapter/i.test(text) || (request.scope === 'chapter' && /regenerate/i.test(text))) {
    if (!request.selectedChapterId) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'chapter.regenerate',
          scope: 'chapter',
          capabilityStatus: 'needs_clarification',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          clarifyingQuestions: [{ id: 'q_chapter', code: 'which_chapter', choices: [] }],
          explanation: ['Select the chapter to regenerate.'],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'chapter.regenerate',
        scope: 'chapter',
        targetChapterId: request.selectedChapterId,
        capabilityStatus: 'supported',
        explanation: ['Regenerate one chapter while keeping every other chapter locked.'],
      }),
    };
  }

  if (/replace/.test(text) && (request.selectedAssetId || request.selectedSceneId)) {
    if (!request.replacementAssetId) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'memory.replace',
          scope: 'memory',
          targetSceneId: request.selectedSceneId,
          targetAssetId: request.selectedAssetId,
          preserveTiming: /keep (the )?timing|preserve timing/i.test(text),
          capabilityStatus: 'needs_clarification',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          clarifyingQuestions: [{ id: 'q_replace', code: 'replace_target', choices: [] }],
          explanation: ['Choose which memory should replace the selected one.'],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'memory.replace',
        scope: 'memory',
        targetSceneId: request.selectedSceneId,
        targetAssetId: request.selectedAssetId,
        replacementAssetId: request.replacementAssetId,
        preserveTiming: true,
        capabilityStatus: 'supported',
        explanation: ['Replace the selected memory while preserving timing, crop, transition and text where locked.'],
      }),
    };
  }

  if (
    /include|add (this |the )?memory|must include/i.test(text) &&
    (request.selectedAssetId || request.clarificationAnswers.assetId)
  ) {
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'memory.include',
        scope: 'memory',
        targetAssetId: request.selectedAssetId ?? request.clarificationAnswers.assetId,
        targetChapterId: request.selectedChapterId,
        capabilityStatus: 'supported',
        explanation: ['Include the selected known memory in the film.'],
      }),
    };
  }

  if (
    /more memories with|include .+ memories|memories with |each grandchild|do not include memories containing/i.test(
      text,
    )
  ) {
    const personId = request.clarificationAnswers.personId ?? request.clarificationAnswers.assetId;
    if (!personId) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: /do not include|exclude memories containing/i.test(text) ? 'memory.exclude' : 'memory.include',
          scope: 'memory',
          capabilityStatus: 'needs_clarification',
          capabilityCode: 'needs_person_context',
          validationStatus: 'pending_clarification',
          clarifyingQuestions: [{ id: 'q_person', code: 'person_selection', choices: [] }],
          explanation: [
            'Choose a family-confirmed person profile first. Unreviewed face groups cannot be used.',
          ],
        }),
      };
    }
    const exclude = /do not include|exclude memories containing|fewer/i.test(text);
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: exclude ? 'memory.exclude' : 'memory.include',
        scope: 'memory',
        targetAssetId: personId,
        capabilityStatus: 'supported',
        capabilityCode: 'ok',
        explanation: [
          exclude
            ? 'Exclude memories linked to the selected confirmed person (asset selection only; no generative removal).'
            : 'Include memories linked to the selected confirmed person after preview.',
        ],
      }),
    };
  }

  if (/exclude|remove (this |the )?memory|do not use/i.test(text) && (request.selectedAssetId || request.selectedSceneId)) {
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'memory.exclude',
        scope: 'memory',
        targetAssetId: request.selectedAssetId,
        targetSceneId: request.selectedSceneId,
        capabilityStatus: 'supported',
        explanation: ['Exclude the selected known memory from the film.'],
      }),
    };
  }

  if (/move .+ (before|after)/i.test(text) || /move (the )?chapter/i.test(text)) {
    const before = /before/i.test(text);
    const after = /after/i.test(text);
    if (!request.selectedChapterId || !request.clarificationAnswers.anchorChapterId) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'chapter.move',
          scope: 'chapter',
          targetChapterId: request.selectedChapterId,
          position: before ? 'before' : after ? 'after' : undefined,
          capabilityStatus: 'needs_clarification',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          clarifyingQuestions: [{ id: 'q_move', code: 'move_anchor', choices: [] }],
          explanation: ['Choose which chapter to move and the chapter it should sit before or after.'],
        }),
      };
    }
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'chapter.move',
        scope: 'chapter',
        targetChapterId: request.selectedChapterId,
        anchorChapterId: request.clarificationAnswers.anchorChapterId,
        position: before ? 'before' : 'after',
        capabilityStatus: 'supported',
        explanation: ['Move the selected chapter relative to another chapter.'],
      }),
    };
  }

  if (/dissolve|fade|transition/i.test(text) && request.selectedSceneId) {
    const transitionIn = /dissolve/i.test(text) ? 'dissolve' : /none|cut/i.test(text) ? 'none' : 'fade';
    return {
      ok: true,
      changeTimeline: false,
      intent: editIntentSchema.parse({
        ...base,
        type: 'transition.change',
        scope: 'scene',
        targetSceneId: request.selectedSceneId,
        transitionIn,
        capabilityStatus: 'supported',
        explanation: [`Change the selected scene transition to ${transitionIn}.`],
      }),
    };
  }

  if (/shorten|lengthen|longer|shorter|target duration|seconds|minutes/i.test(text)) {
    const chapterTarget = Boolean(request.selectedChapterId) || /chapter/i.test(text);
    const sceneTarget = Boolean(request.selectedSceneId) || /scene|clip|photograph|image/i.test(text);
    const factor = /shorten|shorter/i.test(text) ? 0.8 : /lengthen|longer/i.test(text) ? 1.2 : undefined;
    const minutes = text.match(/(\d+)\s*-?\s*minute/)?.[1];
    const seconds = text.match(/(\d+)\s*-?\s*seconds?/)?.[1];
    const durationFrames = minutes
      ? Number(minutes) * 60 * DEFAULT_FPS
      : seconds
        ? Number(seconds) * DEFAULT_FPS
        : undefined;

    if (chapterTarget && !request.selectedChapterId && !request.selectedSceneId) {
      return {
        ok: false,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'chapter.adjust_duration',
          scope: 'chapter',
          capabilityStatus: 'needs_clarification',
          capabilityCode: 'needs_selection',
          validationStatus: 'pending_clarification',
          clarifyingQuestions: [{ id: 'q_chapter', code: 'which_chapter', choices: [] }],
          explanation: ['Which chapter should change duration?'],
        }),
      };
    }

    if (request.selectedChapterId) {
      if (!factor && !durationFrames) {
        return {
          ok: false,
          changeTimeline: false,
          intent: editIntentSchema.parse({
            ...base,
            type: 'chapter.adjust_duration',
            scope: 'chapter',
            targetChapterId: request.selectedChapterId,
            capabilityStatus: 'needs_clarification',
            capabilityCode: 'needs_duration',
            validationStatus: 'pending_clarification',
            clarifyingQuestions: [
              {
                id: 'q_duration',
                code: 'duration_amount',
                choices: [
                  { id: '20pct', labelKey: 'directorEdit.choice.shorten20' },
                  { id: 'specific', labelKey: 'directorEdit.choice.specificDuration' },
                ],
              },
            ],
            explanation: ['Should this chapter shorten by about 20%, or use a specific duration?'],
          }),
        };
      }
      return {
        ok: true,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'chapter.adjust_duration',
          scope: 'chapter',
          targetChapterId: request.selectedChapterId,
          durationFactor: factor,
          durationFrames,
          capabilityStatus: 'supported',
          explanation: ['Adjust the selected chapter duration within protected limits.'],
        }),
      };
    }

    if (request.selectedSceneId || sceneTarget) {
      if (!request.selectedSceneId) {
        return {
          ok: false,
          changeTimeline: false,
          intent: editIntentSchema.parse({
            ...base,
            type: 'scene.adjust_duration',
            scope: 'scene',
            capabilityStatus: 'needs_clarification',
            capabilityCode: 'needs_selection',
            validationStatus: 'pending_clarification',
            clarifyingQuestions: [{ id: 'q_scene', code: 'which_scene', choices: [] }],
            explanation: ['Select the scene to shorten or lengthen.'],
          }),
        };
      }
      return {
        ok: true,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'scene.adjust_duration',
          scope: 'scene',
          targetSceneId: request.selectedSceneId,
          durationFactor: factor ?? 0.8,
          durationFrames,
          capabilityStatus: 'supported',
          explanation: ['Adjust the selected scene duration within image limits.'],
        }),
      };
    }

    if (durationFrames && /whole|entire|film|tribute|overall/i.test(text)) {
      return {
        ok: true,
        changeTimeline: false,
        intent: editIntentSchema.parse({
          ...base,
          type: 'film.target_duration',
          scope: 'film',
          durationFrames,
          capabilityStatus: 'supported',
          explanation: ['Redistribute duration across unlocked scenes toward the target length.'],
        }),
      };
    }
  }

  return {
    ok: false,
    changeTimeline: false,
    intent: editIntentSchema.parse({
      ...base,
      type: 'edit.revert',
      scope: 'last_edit',
      capabilityStatus: 'impossible',
      capabilityCode: 'unsupported_grammar',
      validationStatus: 'invalid',
      explanation: [
        'That instruction is not in the supported command set yet.',
        'Try shortening a selected scene or chapter, moving a chapter, replacing a memory, or regenerating one selection.',
      ],
    }),
  };
}

function buildPatchFromOperations(input: {
  patchId: string;
  tributePublicId: string;
  planId: string;
  briefId: string;
  before: TimelineContract;
  operations: DirectorV2Operation[];
  locks: readonly DirectorLock[];
  timelineVersion: number;
  idempotencyKey: string;
  createdAt: string;
  scope: 'full' | 'chapter';
  chapterId?: string;
  provenance: EditIntent['provenance'];
}): { ok: true; patch: DirectorV2Patch; after: TimelineContract } | { ok: false; reason: string } {
  if (lockConflicts(input.locks, input.operations).length > 0) {
    return { ok: false, reason: 'manual_lock' };
  }
  try {
    const after = applyDirectorOperations(input.before, input.operations);
    parseTimelineContract(after);
    let inverse = invertDirectorOperations(input.before, input.operations);
    try {
      const restored = applyDirectorOperations(after, inverse);
      if (hashTimeline(restored) !== hashTimeline(input.before)) {
        inverse = [
          ...[...after.scenes].reverse().map((scene) => ({ op: 'remove_scene' as const, sceneId: scene.id })),
          ...input.before.scenes.map((scene, index) => ({ op: 'insert_scene' as const, index, scene })),
        ];
      }
    } catch {
      inverse = [
        ...[...after.scenes].reverse().map((scene) => ({ op: 'remove_scene' as const, sceneId: scene.id })),
        ...input.before.scenes.map((scene, index) => ({ op: 'insert_scene' as const, index, scene })),
      ];
    }
    const touchedSceneIds = [
      ...new Set(
        input.operations.flatMap((operation) => {
          if (operation.op === 'insert_scene') {
            return [operation.scene.id];
          }
          if ('sceneId' in operation) {
            return [operation.sceneId];
          }
          return [];
        }),
      ),
    ];
    const patch = directorV2PatchSchema.parse({
      schemaVersion: 1,
      id: input.patchId,
      tributePublicId: input.tributePublicId,
      planId: input.planId,
      briefId: input.briefId,
      baseTimelineVersion: input.timelineVersion,
      baseTimelineHash: hashTimeline(input.before),
      expectedTimelineHash: hashTimeline(after),
      expectedDurationFrames: totalDuration(after),
      operations: input.operations,
      inverseOperations: inverse,
      preconditions: [
        { kind: 'timeline_hash', value: hashTimeline(input.before) },
        { kind: 'timeline_version', value: String(input.timelineVersion) },
      ],
      touchedSceneIds,
      touchedAssetIds: [
        ...new Set(
          after.scenes
            .filter((scene) => touchedSceneIds.includes(scene.id))
            .map(sceneAssetId)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
      preservedLocks: input.locks,
      validationStatus: 'valid',
      previewStatus: 'ready',
      applyStatus: 'none',
      scope: input.scope,
      chapterId: input.chapterId,
      idempotencyKey: input.idempotencyKey,
      provenance: input.provenance,
      createdAt: input.createdAt,
    });
    return { ok: true, patch, after };
  } catch {
    return { ok: false, reason: 'invalid_contract' };
  }
}

export function compileEditIntentToPatch(input: {
  intent: EditIntent;
  request: NaturalLanguageEditRequest;
  timeline: TimelineContract;
  storyPlan: StoryPlan;
  approval: StoryApproval;
  brief: DirectorV2Brief;
  assets: readonly KnownDirectorAsset[];
  patchId: string;
  planId: string;
  briefId: string;
  timelineVersion: number;
  idempotencyKey: string;
  createdAt: string;
  restoreBefore?: TimelineContract;
}):
  | { ok: true; plan: EditPlan; patch: DirectorV2Patch; preview: TimelineContract; changeTimeline: false }
  | { ok: false; reason: string; plan?: EditPlan; changeTimeline: false } {
  if (
    input.approval.storyPlanHash !== hashStoryPlan(input.storyPlan) ||
    input.approval.storyPlanHash !== input.request.storyPlanHash
  ) {
    return { ok: false, reason: 'stale_approval', changeTimeline: false };
  }
  if (hashTimeline(input.timeline) !== input.request.baseTimelineHash) {
    return { ok: false, reason: 'stale_base', changeTimeline: false };
  }
  if (input.intent.capabilityStatus !== 'supported' || input.intent.validationStatus === 'pending_clarification') {
    const plan = editPlanSchema.parse({
      schemaVersion: 1,
      id: `ep_${input.intent.id.slice(-12)}`,
      requestId: input.request.id,
      intentId: input.intent.id,
      interpretation: input.intent.explanation,
      proposedOperationKinds: [],
      preservedSceneIds: input.timeline.scenes.map((scene) => scene.id),
      affectedSceneIds: [],
      affectedChapterIds: [],
      changes: [],
      beforeDurationFrames: totalDuration(input.timeline),
      afterDurationFrames: totalDuration(input.timeline),
      clarificationRequired:
        input.intent.capabilityStatus === 'needs_clarification' ||
        input.intent.capabilityStatus === 'needs_information',
      capabilityStatus: input.intent.capabilityStatus,
      explanation: input.intent.explanation,
      createdAt: input.createdAt,
    });
    return { ok: false, reason: input.intent.capabilityCode, plan, changeTimeline: false };
  }

  const before = input.timeline;
  const operations: DirectorV2Operation[] = [];
  const changes: EditPlanChange[] = [];
  let scope: 'full' | 'chapter' = 'full';
  let chapterId: string | undefined;
  let unchangedHash: string | undefined;

  if (input.intent.type === 'scene.adjust_duration' && input.intent.targetSceneId) {
    const scene = before.scenes.find((item) => item.id === input.intent.targetSceneId);
    if (!scene) {
      return { ok: false, reason: 'unknown_scene', changeTimeline: false };
    }
    const nextFrames = input.intent.durationFrames
      ? scene.type === 'image'
        ? clampImage(input.intent.durationFrames)
        : Math.max(30, Math.min(30 * 60, input.intent.durationFrames))
      : scene.type === 'image'
        ? clampImage(scene.durationFrames * (input.intent.durationFactor ?? 0.8))
        : Math.max(30, Math.round(scene.durationFrames * (input.intent.durationFactor ?? 0.8)));
    operations.push({ op: 'update_duration', sceneId: scene.id, durationFrames: nextFrames });
    changes.push(changeEntry({
      kind: 'duration',
      sceneId: scene.id,
      beforeDurationFrames: scene.durationFrames,
      afterDurationFrames: nextFrames,
      beforeLabel: `${Math.round(scene.durationFrames / DEFAULT_FPS)}s`,
      afterLabel: `${Math.round(nextFrames / DEFAULT_FPS)}s`,
      protected: false,
    }));
  } else if (input.intent.type === 'chapter.adjust_duration' && input.intent.targetChapterId) {
    const block = findChapterBlock(before, input.intent.targetChapterId);
    if (!block) {
      return { ok: false, reason: 'unknown_chapter', changeTimeline: false };
    }
    scope = 'chapter';
    chapterId = input.intent.targetChapterId;
    const mediaScenes = before.scenes.filter(
      (scene) => block.sceneIds.includes(scene.id) && (scene.type === 'image' || scene.type === 'video'),
    );
    const current = mediaScenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
    const target = input.intent.durationFrames ?? Math.round(current * (input.intent.durationFactor ?? 0.8));
    for (const scene of mediaScenes) {
      const share = current === 0 ? 1 / Math.max(1, mediaScenes.length) : scene.durationFrames / current;
      const nextFrames =
        scene.type === 'image' ? clampImage(target * share) : Math.max(30, Math.round(target * share));
      operations.push({ op: 'update_duration', sceneId: scene.id, durationFrames: nextFrames });
      changes.push(changeEntry({
        kind: 'duration',
        sceneId: scene.id,
        chapterId,
        beforeDurationFrames: scene.durationFrames,
        afterDurationFrames: nextFrames,
        protected: false,
      }));
    }
  } else if (input.intent.type === 'transition.change' && input.intent.targetSceneId && input.intent.transitionIn) {
    operations.push({
      op: 'update_transition',
      sceneId: input.intent.targetSceneId,
      transitionIn: input.intent.transitionIn,
    });
    changes.push(changeEntry({
      kind: 'transition',
      sceneId: input.intent.targetSceneId,
      beforeLabel: before.scenes.find((scene) => scene.id === input.intent.targetSceneId)?.transitionIn ?? '',
      afterLabel: input.intent.transitionIn,
      protected: false,
    }));
  } else if (input.intent.type === 'memory.replace' && input.intent.replacementAssetId) {
    const scene =
      before.scenes.find((item) => item.id === input.intent.targetSceneId) ??
      before.scenes.find((item) => sceneAssetId(item) === input.intent.targetAssetId);
    if (!scene || (scene.type !== 'image' && scene.type !== 'video')) {
      return { ok: false, reason: 'unknown_scene', changeTimeline: false };
    }
    if (!input.approval.approvedMemoryIds.includes(input.intent.replacementAssetId)) {
      return { ok: false, reason: 'unapproved_memory', changeTimeline: false };
    }
    const asset = input.assets.find((item) => item.id === input.intent.replacementAssetId);
    if (!asset) {
      return { ok: false, reason: 'unknown_asset', changeTimeline: false };
    }
    const replacement: TimelineScene =
      asset.kind === 'video'
        ? {
            id: scene.id,
            type: 'video',
            durationFrames: scene.durationFrames,
            transitionIn: input.intent.preserveTransition ? scene.transitionIn : 'dissolve',
            transitionOut: scene.transitionOut,
            asset: { assetId: asset.id, src: asset.src },
            caption: input.intent.preserveText ? scene.caption : undefined,
          }
        : {
            id: scene.id,
            type: 'image',
            durationFrames: scene.durationFrames,
            transitionIn: input.intent.preserveTransition ? scene.transitionIn : 'dissolve',
            transitionOut: scene.transitionOut,
            asset: { assetId: asset.id, src: asset.src },
            caption: input.intent.preserveText ? scene.caption : undefined,
            crop:
              input.intent.preserveCrop && scene.type === 'image'
                ? scene.crop
                : { focalX: 0.5, focalY: 0.5, zoom: 1 },
          };
    const index = before.scenes.findIndex((item) => item.id === scene.id);
    operations.push({ op: 'remove_scene', sceneId: scene.id });
    operations.push({ op: 'insert_scene', index, scene: replacement });
    changes.push(changeEntry({
      kind: 'replace',
      sceneId: scene.id,
      assetIdBefore: scene.asset.assetId,
      assetIdAfter: asset.id,
      beforeDurationFrames: scene.durationFrames,
      afterDurationFrames: replacement.durationFrames,
      protected: false,
    }));
  } else if (input.intent.type === 'memory.exclude') {
    const scene =
      before.scenes.find((item) => item.id === input.intent.targetSceneId) ??
      before.scenes.find((item) => sceneAssetId(item) === input.intent.targetAssetId);
    if (!scene) {
      return { ok: false, reason: 'unknown_scene', changeTimeline: false };
    }
    operations.push({ op: 'remove_scene', sceneId: scene.id });
    changes.push(changeEntry({ kind: 'exclude', sceneId: scene.id, assetIdBefore: sceneAssetId(scene), protected: false }));
  } else if (input.intent.type === 'memory.include' && input.intent.targetAssetId) {
    if (!input.approval.approvedMemoryIds.includes(input.intent.targetAssetId)) {
      return { ok: false, reason: 'unapproved_memory', changeTimeline: false };
    }
    const asset = input.assets.find((item) => item.id === input.intent.targetAssetId);
    if (!asset) {
      return { ok: false, reason: 'unknown_asset', changeTimeline: false };
    }
    if (before.scenes.some((scene) => sceneAssetId(scene) === asset.id)) {
      return { ok: false, reason: 'duplicate_asset', changeTimeline: false };
    }
    const insertAt = Math.max(0, before.scenes.findIndex((scene) => scene.type === 'outro'));
    const scene: TimelineScene =
      asset.kind === 'video'
        ? {
            id: `video-${asset.id}`,
            type: 'video',
            durationFrames: 120,
            transitionIn: 'dissolve',
            transitionOut: 'fade',
            asset: { assetId: asset.id, src: asset.src },
          }
        : {
            id: `image-${asset.id}`,
            type: 'image',
            durationFrames: 120,
            transitionIn: 'dissolve',
            transitionOut: 'fade',
            asset: { assetId: asset.id, src: asset.src },
            crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
          };
    operations.push({
      op: 'insert_scene',
      index: insertAt < 0 ? before.scenes.length : insertAt,
      scene,
    });
    changes.push(changeEntry({
      kind: 'include',
      sceneId: scene.id,
      assetIdAfter: asset.id,
      afterDurationFrames: scene.durationFrames,
      protected: false,
    }));
  } else if (input.intent.type === 'chapter.move' && input.intent.targetChapterId && input.intent.anchorChapterId) {
    const target = findChapterBlock(before, input.intent.targetChapterId);
    const anchor = findChapterBlock(before, input.intent.anchorChapterId);
    if (!target || !anchor) {
      return { ok: false, reason: 'unknown_chapter', changeTimeline: false };
    }
    const moving = before.scenes.slice(target.start, target.end);
    const remaining = before.scenes.filter((_, index) => index < target.start || index >= target.end);
    const anchorFresh = chapterBlocks(parseTimelineContract({ ...before, scenes: remaining })).find(
      (block) => block.chapterId === input.intent.anchorChapterId,
    );
    if (!anchorFresh) {
      return { ok: false, reason: 'unknown_chapter', changeTimeline: false };
    }
    const insertAt = input.intent.position === 'after' ? anchorFresh.end : anchorFresh.start;
    const nextScenes = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
    operations.push(
      ...[...before.scenes].reverse().map((scene) => ({ op: 'remove_scene' as const, sceneId: scene.id })),
      ...nextScenes.map((scene, index) => ({ op: 'insert_scene' as const, index, scene })),
    );
    changes.push(changeEntry({
      kind: 'move',
      chapterId: input.intent.targetChapterId,
      beforeLabel: target.title,
      afterLabel: `${input.intent.position ?? 'before'} ${anchor.title}`,
      protected: false,
    }));
  } else if (input.intent.type === 'film.target_duration' && input.intent.durationFrames) {
    const unlocked = before.scenes.filter((scene) => scene.type === 'image' || scene.type === 'video');
    const fixed = totalDuration(before) - unlocked.reduce((sum, scene) => sum + scene.durationFrames, 0);
    const budget = Math.max(unlocked.length * IMAGE_MIN_FRAMES, input.intent.durationFrames - fixed);
    const current = unlocked.reduce((sum, scene) => sum + scene.durationFrames, 0) || 1;
    for (const scene of unlocked) {
      const next =
        scene.type === 'image'
          ? clampImage((scene.durationFrames / current) * budget)
          : Math.max(30, Math.round((scene.durationFrames / current) * budget));
      operations.push({ op: 'update_duration', sceneId: scene.id, durationFrames: next });
      changes.push(changeEntry({
        kind: 'duration',
        sceneId: scene.id,
        beforeDurationFrames: scene.durationFrames,
        afterDurationFrames: next,
        protected: false,
      }));
    }
  } else if (input.intent.type === 'audio.enable_ducking' && before.audio) {
    const ducked = applyAutomaticDucking(before.audio);
    operations.push({ op: 'audio.ducking_set', ducking: ducked.ducking });
    changes.push(
      changeEntry({
        kind: 'audio_ducking',
        beforeLabel: `${before.audio.ducking.regions.length} regions`,
        afterLabel: `${ducked.ducking.regions.length} regions`,
        protected: false,
      }),
    );
  } else if (input.intent.type === 'audio.attach_subtitles' && before.audio?.subtitles[0]) {
    const track = { ...before.audio.subtitles[0], attached: true };
    operations.push({ op: 'audio.subtitle_track_attach', track });
    changes.push(
      changeEntry({
        kind: 'audio_subtitles',
        afterLabel: track.id,
        protected: false,
      }),
    );
  } else if (input.intent.type === 'audio.select_narration' && input.intent.targetAssetId) {
    operations.push({ op: 'audio.narration_take_select', takeId: input.intent.targetAssetId });
    changes.push(
      changeEntry({
        kind: 'audio_narration',
        afterLabel: input.intent.targetAssetId,
        protected: false,
      }),
    );
  } else if (input.intent.type === 'audio.master_profile' && before.audio) {
    const text = input.request.instruction.toLowerCase();
    const masterProfile = /dialogue/.test(text)
      ? ('dialogue_priority' as const)
      : /music forward/.test(text)
        ? ('music_forward' as const)
        : ('ceremony_safe' as const);
    operations.push({ op: 'audio.master_profile', masterProfile });
    changes.push(
      changeEntry({
        kind: 'audio_master',
        beforeLabel: before.audio.masterProfile,
        afterLabel: masterProfile,
        protected: false,
      }),
    );
  } else if (input.intent.type === 'chapter.regenerate' && input.intent.targetChapterId) {
    const regenerated = regenerateDirectorChapter({
      tributePublicId: input.request.tributePublicId,
      brief: parseDirectorBrief(input.brief),
      approval: input.approval,
      storyPlan: input.storyPlan,
      timeline: before,
      assets: input.assets,
      planId: input.planId,
      createdAt: input.createdAt,
      patchId: input.patchId,
      timelineVersion: input.timelineVersion,
      idempotencyKey: input.idempotencyKey,
      chapterId: input.intent.targetChapterId,
    });
    if (!regenerated.ok) {
      return { ok: false, reason: regenerated.reason, changeTimeline: false };
    }
    const plan = editPlanSchema.parse({
      schemaVersion: 1,
      id: `ep_${input.intent.id.slice(-12)}`,
      requestId: input.request.id,
      intentId: input.intent.id,
      interpretation: input.intent.explanation,
      proposedOperationKinds: regenerated.patch.operations.map((operation) => operation.op),
      preservedSceneIds: before.scenes
        .map((scene) => scene.id)
        .filter((id) => !regenerated.patch.touchedSceneIds.includes(id)),
      affectedSceneIds: regenerated.patch.touchedSceneIds,
      affectedChapterIds: [input.intent.targetChapterId],
      changes: [{ kind: 'regenerate', chapterId: input.intent.targetChapterId, protected: false }],
      beforeDurationFrames: totalDuration(before),
      afterDurationFrames: totalDuration(regenerated.preview),
      explanation: input.intent.explanation,
      capabilityStatus: 'supported',
      patchId: regenerated.patch.id,
      unchangedHash: regenerated.unchangedHash,
      createdAt: input.createdAt,
    });
    return { ok: true, plan, patch: regenerated.patch, preview: regenerated.preview, changeTimeline: false };
  } else if (input.intent.type === 'scene.regenerate' && input.intent.targetSceneId) {
    const scene = before.scenes.find((item) => item.id === input.intent.targetSceneId);
    if (!scene || (scene.type !== 'image' && scene.type !== 'video')) {
      return { ok: false, reason: 'unknown_scene', changeTimeline: false };
    }
    const assetId = scene.asset.assetId;
    const alternatives = input.assets.filter(
      (asset) =>
        asset.id !== assetId &&
        input.approval.approvedMemoryIds.includes(asset.id) &&
        !before.scenes.some((item) => sceneAssetId(item) === asset.id),
    );
    const replacement = alternatives[0];
    if (!replacement) {
      return { ok: false, reason: 'needs_information', changeTimeline: false };
    }
    const nextScene: TimelineScene =
      replacement.kind === 'video'
        ? {
            id: scene.id,
            type: 'video',
            durationFrames: scene.durationFrames,
            transitionIn: scene.transitionIn,
            transitionOut: scene.transitionOut,
            asset: { assetId: replacement.id, src: replacement.src },
            caption: scene.caption,
          }
        : {
            id: scene.id,
            type: 'image',
            durationFrames: scene.durationFrames,
            transitionIn: scene.transitionIn,
            transitionOut: scene.transitionOut,
            asset: { assetId: replacement.id, src: replacement.src },
            caption: scene.type === 'image' ? scene.caption : undefined,
            crop: scene.type === 'image' ? scene.crop : { focalX: 0.5, focalY: 0.5, zoom: 1 },
          };
    const index = before.scenes.findIndex((item) => item.id === scene.id);
    operations.push({ op: 'remove_scene', sceneId: scene.id }, { op: 'insert_scene', index, scene: nextScene });
    changes.push(changeEntry({
      kind: 'regenerate',
      sceneId: scene.id,
      assetIdBefore: assetId,
      assetIdAfter: replacement.id,
      beforeDurationFrames: scene.durationFrames,
      afterDurationFrames: nextScene.durationFrames,
      protected: false,
    }));
    unchangedHash = hashUnaffectedScenes(before, [scene.id]);
  } else if (input.intent.type === 'version.restore' && input.restoreBefore) {
    operations.push(
      ...[...before.scenes].reverse().map((scene) => ({ op: 'remove_scene' as const, sceneId: scene.id })),
      ...input.restoreBefore.scenes.map((scene, index) => ({ op: 'insert_scene' as const, index, scene })),
    );
    changes.push(changeEntry({ kind: 'restore', beforeLabel: 'current', afterLabel: 'prior version', protected: false }));
  } else if (input.intent.type === 'edit.revert') {
    return { ok: false, reason: 'use_patch_revert', changeTimeline: false };
  } else {
    return { ok: false, reason: 'unsupported', changeTimeline: false };
  }

  if (operations.length === 0) {
    return { ok: false, reason: 'empty_operations', changeTimeline: false };
  }

  const built = buildPatchFromOperations({
    patchId: input.patchId,
    tributePublicId: input.request.tributePublicId,
    planId: input.planId,
    briefId: input.briefId,
    before,
    operations,
    locks: input.intent.requiredLocks,
    timelineVersion: input.timelineVersion,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt,
    scope,
    chapterId,
    provenance: input.intent.provenance,
  });
  if (!built.ok) {
    return { ok: false, reason: built.reason, changeTimeline: false };
  }

  const affected = built.patch.touchedSceneIds;
  const plan = editPlanSchema.parse({
    schemaVersion: 1,
    id: `ep_${input.intent.id.slice(-12)}`,
    requestId: input.request.id,
    intentId: input.intent.id,
    interpretation: input.intent.explanation,
    proposedOperationKinds: operations.map((operation) => operation.op),
    preservedSceneIds: before.scenes.map((scene) => scene.id).filter((id) => !affected.includes(id)),
    affectedSceneIds: affected,
    affectedChapterIds: chapterId ? [chapterId] : [],
    changes,
    beforeDurationFrames: totalDuration(before),
    afterDurationFrames: totalDuration(built.after),
    explanation: input.intent.explanation,
    capabilityStatus: 'supported',
    patchId: built.patch.id,
    unchangedHash: unchangedHash ?? hashUnaffectedScenes(before, affected),
    createdAt: input.createdAt,
  });
  return { ok: true, plan, patch: built.patch, preview: built.after, changeTimeline: false };
}

export function detectPatchOverlap(input: {
  patch: DirectorV2Patch;
  current: TimelineContract;
}): { overlaps: boolean; conflictingSceneIds: string[] } {
  if (hashTimeline(input.current) === input.patch.expectedTimelineHash) {
    return { overlaps: false, conflictingSceneIds: [] };
  }
  if (hashTimeline(input.current) === input.patch.baseTimelineHash) {
    return { overlaps: false, conflictingSceneIds: [] };
  }
  return { overlaps: true, conflictingSceneIds: [...input.patch.touchedSceneIds] };
}

export function createDeterministicEditInterpreter() {
  return {
    id: 'deterministic-edit-interpreter',
    kind: 'deterministic' as const,
    interpret: interpretDeterministicEdit,
  };
}

export function selectEditProvider(_input: { generativeConfigured: boolean; consentGranted: boolean }) {
  return createDeterministicEditInterpreter();
}
