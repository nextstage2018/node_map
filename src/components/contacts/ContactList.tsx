'use client';

import type { ContactPerson, PersonRelationshipType } from '@/lib/types';
import ContactCard from './ContactCard';

interface ContactListProps {
  contacts: ContactPerson[];
  onRelationshipChange: (id: string, type: PersonRelationshipType) => void;
}

export default function ContactList({
  contacts,
  onRelationshipChange,
}: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-400">該当するコンタクトがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          onRelationshipChange={onRelationshipChange}
        />
      ))}
    </div>
  );
}
