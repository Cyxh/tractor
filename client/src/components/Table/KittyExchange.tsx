import React, { useState } from 'react';
import { Card, cardId } from 'tractor-shared';
import CardComponent from './Card';
import './KittyExchange.css';

interface KittyExchangeProps {
  hand: Card[];
  kitty: Card[];
  kittySize: number;
  onExchange: (newKitty: Card[]) => void;
}

const KittyExchange: React.FC<KittyExchangeProps> = ({
  hand, kitty, kittySize, onExchange
}) => {
  const [selectedForKitty, setSelectedForKitty] = useState<Card[]>([]);

  const allCards = hand;

  const toggleCard = (card: Card) => {
    const idx = selectedForKitty.findIndex(c => cardId(c) === cardId(card));
    if (idx >= 0) {
      setSelectedForKitty(prev => prev.filter((_, i) => i !== idx));
    } else if (selectedForKitty.length < kittySize) {
      setSelectedForKitty(prev => [...prev, card]);
    }
  };

  const handleConfirm = () => {
    if (selectedForKitty.length === kittySize) {
      onExchange(selectedForKitty);
    }
  };

  return (
    <div className="kitty-exchange">
      <div className="kitty-exchange-header">
        <h3>Select {kittySize} cards for the kitty</h3>
        <span className="kitty-count">
          {selectedForKitty.length}/{kittySize} selected
        </span>
      </div>

      <div className="kitty-exchange-cards">
        {allCards.map((card) => {
          const isSelected = selectedForKitty.some(c => cardId(c) === cardId(card));
          return (
            <CardComponent
              key={cardId(card)}
              card={card}
              selected={isSelected}
              onClick={() => toggleCard(card)}
            />
          );
        })}
      </div>

      <div className="kitty-exchange-actions">
        {selectedForKitty.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={() => setSelectedForKitty([])}
          >
            Deselect All
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={selectedForKitty.length !== kittySize}
        >
          Confirm Kitty ({selectedForKitty.length}/{kittySize})
        </button>
      </div>
    </div>
  );
};

export default KittyExchange;
