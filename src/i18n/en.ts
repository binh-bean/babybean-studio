/**
 * English strings. Must mirror the key shape of vi.ts exactly.
 * OWNER: DEV-UI. Task BB-069 completes the remaining copy.
 */

import type { Messages } from "./vi";

export const en: Messages = {
  common: {
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    back: "Back",
    retry: "Try again",
    loading: "Loading…",
    saving: "Saving…",
    saved: "Saved",
    unsaved: "Not saved",
    offline: "You are offline — your choices are kept and will save once you reconnect",
  },
  gallery: {
    pinTitle: "Enter the last 4 digits of your registered phone number",
    pinSubmit: "View album",
    pinWrong: "Wrong PIN, {n} attempts left",
    pinLocked: "Too many wrong attempts. Please try again in {m} minutes",
    pinHelp: "Forgot the code? Call us at {hotline}",

    filterAll: "All",
    filterSelected: "Selected",
    filterFavorite: "Favourites",
    filterNoted: "With notes",
    filterUnselected: "Not selected",

    quotaSummary: "Selected {selected}/{quota}",
    quotaExtra: "{count} extra = {amount}",
    quotaWarningTitle: "This photo is beyond your package",
    quotaWarningBody: "Each extra photo costs {price}. Add it anyway?",
    quotaWarningDontAsk: "Do not ask again this session",
    quotaHardLimit: "You have reached the maximum of {max} photos for this album",

    select: "Select this photo",
    deselect: "Deselect",
    favorite: "Favourite",
    addNote: "Add a retouch note",
    notePlaceholder: "For example: brighten the skin, remove the object behind…",
    noteTags: {
      xoa_mun: "Remove baby acne",
      lam_sang_da: "Brighten skin",
      xoa_vat_the: "Remove object",
      cat_cup: "Recrop",
      doi_nen: "Change background",
      ghep_mat: "Open eyes",
    },

    reviewCta: "Review and confirm",
    reviewTitle: "Please check your selection",
    reviewUnusedQuota: "You still have {n} free photos unused. Submit anyway?",
    submitCta: "Submit selection",
    submitConfirm: "You will not be able to change this afterwards. Are you sure?",
    submitAgree: "I confirm this list is final",

    doneTitle: "Thank you!",
    doneBody: "We have received your list and started retouching.",

    lockedBanner: "You submitted on {date}. This album is now read-only.",
    expiredTitle: "This link has expired",
    expiredBody: "Please contact the studio for a new link.",
    notFoundTitle: "Album not found",
    photoMissing: "This photo is no longer available, please contact the studio",
    emptyFilter: "No photos in this view",
    preparing: "Your album is being prepared. We will let you know when it is ready.",
  },
};
