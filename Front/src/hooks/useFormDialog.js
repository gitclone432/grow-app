import { useState } from 'react';

/**
 * Manages all state for a create / edit form dialog.  Replaces the repeated
 * `openDialog + editingId + formData + handleSubmit + handleClose` pattern
 * found across 40+ admin pages.
 *
 * The hook is intentionally API-agnostic: the caller provides an `onSave`
 * callback that receives `(formData, editingId)` and is responsible for
 * calling the appropriate `api.post` / `api.put`.  This keeps the hook generic
 * while still centralising loading and error state.
 *
 * @param {object} initialValues - Shape of the empty form (used for reset).
 * @param {object} [options]
 * @param {(formData: object, editingId: string|null) => Promise<void>} options.onSave
 *   Async function called on submit.  Should throw on failure so the hook can
 *   surface the error.
 * @param {() => void} [options.onAfterSave]
 *   Called after a successful save — typically `refetch` from `useFetchTable`.
 *
 * @returns {{
 *   formData:   object,
 *   setFormData: (data: object) => void,
 *   open:       boolean,
 *   editingId:  string | null,
 *   openCreate: () => void,
 *   openEdit:   (row: object, mapper?: (row: object) => object) => void,
 *   handleClose: () => void,
 *   handleSave: () => Promise<void>,
 *   saving:     boolean,
 *   saveError:  string,
 * }}
 *
 * @example
 * const dialog = useFormDialog(
 *   { name: '', amount: '' },
 *   {
 *     onSave: (formData, editingId) =>
 *       editingId
 *         ? api.put(`/bank-accounts/${editingId}`, formData)
 *         : api.post('/bank-accounts', formData),
 *     onAfterSave: refetch,
 *   },
 * );
 *
 * // In JSX:
 * <Button onClick={dialog.openCreate}>Add</Button>
 * <Button onClick={() => dialog.openEdit(row)}>Edit</Button>
 * <MyDialog
 *   open={dialog.open}
 *   formData={dialog.formData}
 *   setFormData={dialog.setFormData}
 *   onClose={dialog.handleClose}
 *   onSave={dialog.handleSave}
 *   saving={dialog.saving}
 *   error={dialog.saveError}
 * />
 */
export default function useFormDialog(initialValues, { onSave, onAfterSave } = {}) {
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(initialValues);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    /** Open the dialog in create mode with a blank form. */
    const openCreate = () => {
        setFormData(initialValues);
        setEditingId(null);
        setSaveError('');
        setOpen(true);
    };

    /**
     * Open the dialog in edit mode, pre-populating the form from a table row.
     *
     * @param {object} row     - The row object (must have `_id`).
     * @param {Function} [mapper] - Optional transform: `(row) => formData`.
     *   Defaults to spreading the row over `initialValues` so that any form
     *   fields not present on the row keep their initial value.
     */
    const openEdit = (row, mapper = null) => {
        setFormData(mapper ? mapper(row) : { ...initialValues, ...row });
        setEditingId(row._id);
        setSaveError('');
        setOpen(true);
    };

    /** Close and fully reset the dialog. */
    const handleClose = () => {
        setOpen(false);
        setEditingId(null);
        setFormData(initialValues);
        setSaveError('');
    };

    /**
     * Invoke `onSave`, then close and call `onAfterSave` on success, or
     * surface the error on failure.
     */
    const handleSave = async () => {
        if (!onSave) return;
        setSaving(true);
        setSaveError('');
        try {
            await onSave(formData, editingId);
            handleClose();
            onAfterSave?.();
        } catch (err) {
            setSaveError(err.response?.data?.error || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return {
        formData,
        setFormData,
        open,
        editingId,
        openCreate,
        openEdit,
        handleClose,
        handleSave,
        saving,
        saveError,
    };
}
