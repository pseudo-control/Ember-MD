// Copyright (c) 2026 Ember Contributors. MIT License.
import { Component, Show } from 'solid-js';

interface StopConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
}

const StopConfirmModal: Component<StopConfirmModalProps> = (props) => (
  <Show when={props.isOpen}>
    <div class="modal modal-open">
      <div class="modal-box max-w-xs">
        <h3 class="font-bold text-sm mb-3">{props.title || 'Stop Job?'}</h3>
        <p class="text-xs text-base-content/70 mb-3">
          {props.message || 'Are you sure you want to cancel this job?'}
        </p>
        <div class="modal-action">
          <button class="btn btn-sm" onClick={() => props.onCancel()}>Cancel</button>
          <button class="btn btn-error btn-sm" onClick={() => props.onConfirm()}>Stop</button>
        </div>
      </div>
      <div class="modal-backdrop" onClick={() => props.onCancel()} />
    </div>
  </Show>
);

export default StopConfirmModal;
